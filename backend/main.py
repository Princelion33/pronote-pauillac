import os
import json
import uuid
import base64
import datetime
from html import unescape
from urllib.parse import urljoin
from typing import Dict, Any, Optional, List
import requests
from bs4 import BeautifulSoup
from fastapi import FastAPI, HTTPException, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

import pronotepy
from pronotepy.exceptions import ENTLoginError


PENDING_EDUCONNECT: Dict[str, Dict[str, Any]] = {}


class EduConnectVerificationRequired(Exception):
    def __init__(self, payload: Dict[str, Any]) -> None:
        self.payload = payload
        super().__init__(payload.get("title") or "Confirmation de l'identité requise")


def _inspect_educonnect_verification_form(r: requests.Response, soup: BeautifulSoup) -> Optional[Dict[str, Any]]:
    """Extracts ÉduConnect identity-confirmation / OTP / method-choice form metadata."""
    if soup.find("input", {"name": "SAMLResponse"}):
        return None
    form = soup.find("form", {"id": "validerAuth"}) or soup.find("form")
    if not form:
        return None

    hidden_fields: Dict[str, str] = {}
    inputs: List[Dict[str, str]] = []
    choices: List[Dict[str, str]] = []

    for inp in form.find_all("input"):
        name = inp.get("name")
        if not name:
            continue
        itype = (inp.get("type") or "text").lower()
        if itype == "hidden":
            hidden_fields[name] = inp.get("value", "")
        elif itype == "radio":
            radio_id = inp.get("id")
            lbl_el = soup.find("label", {"for": radio_id}) if radio_id else None
            lbl = lbl_el.get_text(" ", strip=True) if lbl_el else (inp.get("value") or name)
            choices.append({"name": name, "value": inp.get("value", ""), "label": lbl})
        elif itype in ("text", "tel", "number", "date", "password", "email"):
            inp_id = inp.get("id")
            lbl_el = soup.find("label", {"for": inp_id}) if inp_id else None
            lbl = (
                lbl_el.get_text(" ", strip=True)
                if lbl_el
                else (inp.get("placeholder") or inp.get("aria-label") or name)
            )
            inputs.append({
                "name": name,
                "label": lbl,
                "placeholder": inp.get("placeholder") or lbl,
                "type": itype,
                "maxlength": str(inp.get("maxlength") or ""),
            })

    if "shib_idp_ls_supported" in hidden_fields:
        return None

    for btn in form.find_all(["button", "input"]):
        if btn.name == "input" and (btn.get("type") or "").lower() not in ("submit", "button"):
            continue
        if btn.name == "button" and (btn.get("type") or "submit").lower() not in ("submit", ""):
            continue
        bname = btn.get("name")
        if not bname or "cancel" in bname.lower() or "retour" in (btn.get_text(strip=True) or "").lower():
            continue
        blabel = btn.get_text(" ", strip=True) or btn.get("value") or "Continuer"
        choices.append({"name": bname, "value": btn.get("value", ""), "label": blabel})

    if not inputs and not choices:
        return None

    visible_input_name = inputs[0]["name"] if inputs else ""
    visible_input_label = inputs[0]["label"] if inputs else ""

    title = soup.title.get_text(strip=True) if soup.title else "Confirmation de l'identité - ÉduConnect"
    prompt_parts: List[str] = []
    for el in soup.select("h1, h2, .fr-callout p, .fr-alert p, form p"):
        txt = el.get_text(" ", strip=True)
        if txt and txt not in prompt_parts and len(txt) > 8:
            prompt_parts.append(txt)
        if len(prompt_parts) >= 3:
            break

    error_texts: List[str] = []
    for err_el in soup.select(".fr-alert--error, .fr-error-text, [role='alert'], .message-erreur"):
        txt = err_el.get_text(" ", strip=True)
        if txt and txt not in error_texts:
            error_texts.append(txt)

    print(
        f"[ENT Verif Form] action={form.get('action')!r} hidden={list(hidden_fields.keys())!r} "
        f"inputs={[i['name'] for i in inputs]!r} choices={choices!r}",
        flush=True,
    )

    return {
        "title": title,
        "prompt": " ".join(prompt_parts) if prompt_parts else "ÉduConnect demande une confirmation de votre identité.",
        "action_url": urljoin(r.url, form.get("action") or r.url),
        "hidden_fields": hidden_fields,
        "inputs": inputs,
        "input_name": visible_input_name,
        "input_label": visible_input_label,
        "choices": choices,
        "error": error_texts[0] if error_texts else None,
    }


def _finish_educonnect_saml_and_cas(
    session: requests.Session,
    r: requests.Response,
    soup: BeautifulSoup,
    pronote_url: str,
) -> requests.cookies.RequestsCookieJar:
    """Completes intermediate Shibboleth forms, SAML ACS post, and CAS login to Pronote."""
    for _ in range(5):
        if soup.find("input", {"name": "SAMLResponse"}):
            break
        next_form = soup.find("form")
        if not next_form:
            break
        step_payload: Dict[str, str] = {}
        for inp in next_form.find_all("input"):
            name = inp.get("name")
            if not name:
                continue
            inp_type = (inp.get("type") or "").lower()
            if inp_type in ("radio", "checkbox"):
                if inp.has_attr("checked") or name not in step_payload:
                    step_payload[name] = inp.get("value", "")
            else:
                step_payload[name] = inp.get("value", "")

        if "shib_idp_ls_supported" in step_payload:
            step_payload["shib_idp_ls_supported"] = "true"
        if "shib_idp_ls_success.shib_idp_session_ss" in step_payload:
            step_payload["shib_idp_ls_success.shib_idp_session_ss"] = "true"
        if "_eventId_proceed" not in step_payload:
            step_payload["_eventId_proceed"] = ""

        step_action = urljoin(r.url, next_form.get("action") or r.url)
        r = session.post(step_action, data=step_payload, timeout=15)
        soup = BeautifulSoup(r.text, "html.parser")

    saml_input = soup.find("input", {"name": "SAMLResponse"})
    if not saml_input:
        page_alerts = [
            el.get_text(" ", strip=True)
            for el in soup.select(".fr-alert, .fr-callout, h1, .error")
            if el.get_text(strip=True)
        ]
        detail = page_alerts[0] if page_alerts else "Action requise sur votre compte ÉduConnect (première connexion ou validation)."
        raise ENTLoginError(f"ÉduConnect n'a pas renvoyé de jeton SAML : {detail}")

    saml_form = saml_input.find_parent("form") or soup.find("form")
    saml_payload = {
        inp.get("name"): inp.get("value", "")
        for inp in saml_form.find_all("input")
        if inp.get("name")
    }
    acs_url = urljoin(r.url, saml_form.get("action") or "https://mon.lyceeconnecte.fr/auth/saml/acs")
    session.post(acs_url, data=saml_payload, timeout=15)

    cas_resp = session.get(
        "https://mon.lyceeconnecte.fr/cas/login",
        params={"service": pronote_url},
        allow_redirects=True,
        timeout=15,
    )
    if "index-education.net" not in (cas_resp.url or ""):
        raise ENTLoginError(
            "Connexion ÉduConnect validée, mais la redirection CAS vers Pronote Pauillac (0332081H) a échoué. "
            "Essayez la connexion par QR Code Pronote."
        )

    return session.cookies


def lyceeconnecte_pauillac_ent(username: str, password: str, **kwargs: Any) -> requests.cookies.RequestsCookieJar:
    """
    Authentification SAML2 complète pour ÉduConnect -> Lycée Connecté Nouvelle-Aquitaine (mon.lyceeconnecte.fr)
    avec gestion des étapes Shibboleth IdP v4/v5 et de la confirmation d'identité interactive.
    """
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7",
    }
    sso_url = (
        "https://educonnect.education.gouv.fr/idp/profile/SAML2/Unsolicited/SSO"
        "?providerId=https://mon.lyceeconnecte.fr/auth/saml/metadata/idp.xml"
    )
    pronote_target = kwargs.get("pronote_url") or PRONOTE_URL

    session = requests.Session()
    keep_session_open = False
    try:
        session.headers.update(headers)

        # Étape 1 : Chargement initial Shibboleth (e1s1)
        r = session.get(sso_url, timeout=15)
        soup = BeautifulSoup(r.text, "html.parser")
        page_title = soup.title.get_text(strip=True) if soup.title else ""
        print(f"[ENT Step 1 GET] status={r.status_code} url={r.url} title={page_title!r}", flush=True)

        if r.status_code >= 400:
            raise ENTLoginError(
                f"ÉduConnect a refusé la connexion depuis le serveur (HTTP {r.status_code} — {page_title or 'Accès bloqué'})."
            )

        form = soup.find("form")
        if form and not soup.find("input", {"name": "j_username"}):
            ls_payload = {
                inp.get("name"): inp.get("value", "")
                for inp in form.find_all("input")
                if inp.get("name")
            }
            if "shib_idp_ls_supported" in ls_payload:
                ls_payload["shib_idp_ls_supported"] = "true"
            if "shib_idp_ls_success.shib_idp_session_ss" in ls_payload:
                ls_payload["shib_idp_ls_success.shib_idp_session_ss"] = "true"
            if "shib_idp_ls_success.shib_idp_persistent_ss" in ls_payload:
                ls_payload["shib_idp_ls_success.shib_idp_persistent_ss"] = "true"
            ls_payload["_eventId_proceed"] = ls_payload.get("_eventId_proceed", "")

            action_url = urljoin(r.url, form.get("action") or r.url)
            r = session.post(action_url, data=ls_payload, timeout=15)
            soup = BeautifulSoup(r.text, "html.parser")
            page_title = soup.title.get_text(strip=True) if soup.title else ""
            print(f"[ENT Step 1b POST] status={r.status_code} url={r.url} title={page_title!r}", flush=True)

        # Étape 2 : Soumission du formulaire d'authentification ÉduConnect (e1s2)
        auth_form = soup.find("form", {"id": "validerAuth"}) or soup.find("form")
        if not auth_form:
            body_lower = r.text.lower()
            if any(w in body_lower for w in ("captcha", "access denied", "accès refusé", "temporairement indisponible")):
                raise ENTLoginError(
                    f"ÉduConnect bloque ou demande un contrôle anti-bot sur ce serveur (HTTP {r.status_code} — {page_title or 'CAPTCHA/WAF'})."
                )
            raise ENTLoginError(
                f"Formulaire ÉduConnect introuvable (HTTP {r.status_code}, page: {page_title or r.url})."
            )

        auth_payload = {
            inp.get("name"): inp.get("value", "")
            for inp in auth_form.find_all("input")
            if inp.get("name")
        }
        auth_payload["j_username"] = username.strip()
        auth_payload["j_password"] = password
        auth_payload["_eventId_proceed"] = auth_payload.get("_eventId_proceed", "")

        auth_action = urljoin(r.url, auth_form.get("action") or r.url)
        r = session.post(auth_action, data=auth_payload, timeout=15)
        soup = BeautifulSoup(r.text, "html.parser")
        post_title = soup.title.get_text(strip=True) if soup.title else ""
        print(f"[ENT Step 2 POST] status={r.status_code} url={r.url} title={post_title!r}", flush=True)

        if r.status_code >= 400:
            raise ENTLoginError(
                f"ÉduConnect a rejeté la requête (HTTP {r.status_code} — {post_title or 'Erreur serveur'})."
            )

        is_confirmation_page = any(
            k in post_title.lower()
            for k in ("confirmation", "identité", "vérification", "double authentification")
        )

        # Vérifier si ÉduConnect demande une confirmation d'identité AVANT de tester validerAuth
        if is_confirmation_page or (not soup.find("input", {"name": "j_password"}) and not soup.find("form", {"id": "validerAuth"})):
            verif = _inspect_educonnect_verification_form(r, soup)
            if verif:
                challenge_id = str(uuid.uuid4())
                PENDING_EDUCONNECT[challenge_id] = {
                    "session": session,
                    "username": username.strip(),
                    "password": password,
                    "pronote_url": pronote_target,
                    "form": verif,
                }
                keep_session_open = True
                raise EduConnectVerificationRequired({
                    "challenge_id": challenge_id,
                    "title": verif["title"],
                    "prompt": verif["prompt"],
                    "inputs": verif["inputs"],
                    "input_name": verif["input_name"],
                    "input_label": verif["input_label"],
                    "choices": verif["choices"],
                    "error": verif["error"],
                })

        # Vérification : identifiant/mot de passe invalide
        if soup.find("input", {"name": "j_password"}) or soup.find("form", {"id": "validerAuth"}):
            error_texts = []
            for err_el in soup.select(".fr-alert--error, .fr-alert, .fr-error-text, .alert, p.error, [role='alert'], #erreurMdp, #erreurIdentifiant, .message-erreur"):
                txt = err_el.get_text(" ", strip=True)
                if txt and txt not in error_texts:
                    error_texts.append(txt)
            print(f"[ENT Step 2 Errors] errors={error_texts!r}", flush=True)
            err_msg = (
                error_texts[0]
                if error_texts
                else f"Échec de connexion ÉduConnect (HTTP {r.status_code}, page: {post_title or 'Connexion'})."
            )
            raise ENTLoginError(err_msg)

        return _finish_educonnect_saml_and_cas(session, r, soup, pronote_target)
    finally:
        if not keep_session_open:
            session.close()


app = FastAPI(
    title="Pronote Custom API - Lycée Odilon Redon (Pauillac 0332081H)",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

PRONOTE_URL = "https://0332081h.index-education.net/pronote/eleve.html"

# Active multi-user sessions
# token -> {"mode": "real" | "demo", "client": pronotepy.Client | None, "user": dict, "state": dict}
SESSIONS: Dict[str, Dict[str, Any]] = {}

SUBJECT_GRADIENTS = {
    "HUMAN.LITTER.PHILO.": "linear-gradient(180deg, #2B038C 0%, #4A06F2 100%)",
    "NUMERIQUE SC.INFORM.": "linear-gradient(180deg, #3C784F 0%, #61C581 100%)",
    "NUMERIQUE.SC.INFORM.": "linear-gradient(180deg, #3C784F 0%, #61C581 100%)",
    "MATHS SPECIFIQUES.": "linear-gradient(180deg, #00561F 0%, #019034 100%)",
    "MATHEMATIQUES": "linear-gradient(180deg, #00561F 0%, #019034 100%)",
    "FRANÇAIS": "linear-gradient(180deg, #1B208C 0%, #121AD2 100%)",
    "ESPAGNOL LV2": "linear-gradient(180deg, #0F2B6B 0%, #2A4D9B 100%)",
    "ANGLAIS LV1": "linear-gradient(180deg, #8C1B44 0%, #D21258 100%)",
    "HISTOIRE-GEOGRAPHIE": "linear-gradient(180deg, #B45309 0%, #F59E0B 100%)",
    "ENSEIGN.SCIENTIFIQUE": "linear-gradient(180deg, #0369A1 0%, #0EA5E9 100%)",
    "ED.PHYSIQUE & SPORT.": "linear-gradient(180deg, #008673 0%, #40B2A1 100%)",
    "EMC": "linear-gradient(180deg, #4F46E5 0%, #818CF8 100%)",
}


def get_subject_gradient(subject_name: str) -> str:
    upper = (subject_name or "").upper()
    for key, grad in SUBJECT_GRADIENTS.items():
        if key in upper or upper in key:
            return grad
    # Deterministic vibrant gradient from subject name hash
    palette = [
        "linear-gradient(180deg, #2B038C 0%, #4A06F2 100%)",
        "linear-gradient(180deg, #3C784F 0%, #61C581 100%)",
        "linear-gradient(180deg, #00561F 0%, #019034 100%)",
        "linear-gradient(180deg, #1B208C 0%, #121AD2 100%)",
        "linear-gradient(180deg, #0F2B6B 0%, #2A4D9B 100%)",
        "linear-gradient(180deg, #008673 0%, #40B2A1 100%)",
    ]
    return palette[sum(ord(c) for c in upper) % len(palette)]


def build_default_demo_state() -> Dict[str, Any]:
    """
    Exact data from the Figma prototype (Lycée Odilon Redon - Pauillac 0332081H)
    plus rich data for all 7 top navigation menus so every single view and animation works out of the box.
    """
    return {
        "user": {
            "name": "Élève Odilon Redon",
            "class_name": "Première Générale 1",
            "establishment": "Lycée Odilon Redon — Pauillac (0332081H)",
            "ine": "0332081H942A",
            "email": "eleve.pauillac@mon.lyceeconnecte.fr",
            "phone": "06 12 34 56 78",
            "address": "2 Rue Odilon Redon, 33250 Pauillac",
            "delegue": False,
            "regime": "Demi-pensionnaire",
        },
        "sticky_note": "",
        "days": {
            "2026-09-04": {
                "label": "ven. 04 sept.",
                "week": "Semaine Q1",
                "lessons": [
                    {
                        "id": "v1",
                        "start": "8h00",
                        "end": "10h00",
                        "subject": "FRANÇAIS",
                        "location_tag": "PAUILLAC",
                        "teacher": "ALINDRE N.",
                        "group": "[1 1 P2]",
                        "room": "G 106",
                        "gradient": "linear-gradient(180deg, #1B208C 0%, #121AD2 100%)",
                        "height": 102,
                        "canceled": False,
                    },
                    {
                        "id": "v2",
                        "start": "10h00",
                        "end": "12h00",
                        "subject": "ANGLAIS LV1",
                        "location_tag": "PAUILLAC",
                        "teacher": "MARTIN C.",
                        "group": "[1 G1 ANG]",
                        "room": "B 204",
                        "gradient": "linear-gradient(180deg, #8C1B44 0%, #D21258 100%)",
                        "height": 102,
                        "canceled": False,
                    },
                    {
                        "id": "v-lunch",
                        "start": "12h00",
                        "end": "13h00",
                        "is_lunch": True,
                        "gradient": "linear-gradient(180deg, #8D8D8D 0%, #E2E2E2 100%)",
                        "height": 39,
                    },
                    {
                        "id": "v3",
                        "start": "13h00",
                        "end": "15h00",
                        "subject": "HISTOIRE-GEOGRAPHIE",
                        "location_tag": "PAUILLAC",
                        "teacher": "DUBOIS M.",
                        "group": "[1 G1 HG]",
                        "room": "D 102",
                        "gradient": "linear-gradient(180deg, #B45309 0%, #F59E0B 100%)",
                        "height": 102,
                        "canceled": False,
                    },
                    {
                        "id": "v4",
                        "start": "15h00",
                        "end": "17h00",
                        "subject": "ED.PHYSIQUE & SPORT.",
                        "location_tag": "PAUILLAC",
                        "teacher": "BERNARD T.",
                        "group": "[1 G1 EPS]",
                        "room": "GYMNASE",
                        "gradient": "linear-gradient(180deg, #008673 0%, #40B2A1 100%)",
                        "height": 102,
                        "canceled": False,
                    },
                ],
                "canteen": {
                    "subtitle": "Bon appétit !",
                    "items": [
                        "Salade de tomates bio du Médoc",
                        "Filet de merlu meunière & Riz pilaf",
                        "Yaourt fermier / Fruit de saison",
                    ],
                },
            },
            "2026-09-07": {
                "label": "lun. 07 sept.",
                "week": "Semaine Q2",
                "lessons": [
                    {
                        "id": "l1",
                        "start": "8h00",
                        "end": "10h00",
                        "subject": "HUMAN.LITTER.PHILO.",
                        "location_tag": "PAUILLAC",
                        "teacher": "SEGUELA P.",
                        "group": "[1 SPE A P HLP TA/SEG]",
                        "room": "D 106",
                        "gradient": "linear-gradient(180deg, #2B038C 0%, #4A06F2 100%)",
                        "height": 102,
                        "canceled": False,
                    },
                    {
                        "id": "l2",
                        "start": "10h00",
                        "end": "12h00",
                        "subject": "NUMERIQUE SC.INFORM.",
                        "location_tag": "PAUILLAC",
                        "teacher": "MALIGE P.",
                        "group": "[1 SPE B P NSI MAL]",
                        "room": "C 03-04 STI2D",
                        "gradient": "linear-gradient(180deg, #3C784F 0%, #61C581 100%)",
                        "height": 102,
                        "canceled": False,
                    },
                    {
                        "id": "l-lunch",
                        "start": "12h00",
                        "end": "13h00",
                        "is_lunch": True,
                        "gradient": "linear-gradient(180deg, #8D8D8D 0%, #E2E2E2 100%)",
                        "height": 39,
                    },
                    {
                        "id": "l3",
                        "start": "13h00",
                        "end": "14h30",
                        "subject": "MATHS SPECIFIQUES.",
                        "location_tag": "PAUILLAC",
                        "teacher": "GATA L.",
                        "group": "[MATHS NON SPE G1 P]",
                        "room": "E 106",
                        "gradient": "linear-gradient(180deg, #00561F 0%, #019034 100%)",
                        "height": 102,
                        "canceled": False,
                    },
                    {
                        "id": "l4",
                        "start": "14h30",
                        "end": "15h30",
                        "subject": "FRANÇAIS",
                        "location_tag": "PAUILLAC",
                        "teacher": "ALINDRE N.",
                        "group": "[1 1 P2]",
                        "room": "G 106",
                        "gradient": "linear-gradient(180deg, #1B208C 0%, #121AD2 100%)",
                        "height": 102,
                        "canceled": False,
                    },
                    {
                        "id": "l5",
                        "start": "15h30",
                        "end": "16h30",
                        "subject": "FRANÇAIS",
                        "location_tag": "PAUILLAC",
                        "teacher": "ALINDRE N.",
                        "group": "[1 1 AP FR]",
                        "room": "G 102",
                        "gradient": "linear-gradient(180deg, #1B208C 0%, #121AD2 100%)",
                        "height": 102,
                        "canceled": False,
                    },
                    {
                        "id": "l6",
                        "start": "16h30",
                        "end": "17h30",
                        "subject": "FRANÇAIS",
                        "location_tag": "PAUILLAC",
                        "teacher": "ALINDRE N.",
                        "group": "",
                        "room": "G 102",
                        "gradient": "linear-gradient(180deg, #1B208C 0%, #121AD2 100%)",
                        "height": 86,
                        "canceled": False,
                    },
                ],
                "canteen": {
                    "subtitle": "Bon appétit !",
                    "items": [
                        "Velouté de potimarron aux croûtons",
                        "Émincé de volaille sauce estragon & Torsades bio",
                        "Fromage des Pyrénées & Tarte aux pommes",
                    ],
                },
            },
            "2026-09-08": {
                "label": "mar. 08 sept.",
                "week": "Semaine Q2",
                "lessons": [
                    {
                        "id": "m1",
                        "start": "8h00",
                        "end": "10h00",
                        "subject": "NUMERIQUE SC.INFORM.",
                        "location_tag": "PAUILLAC",
                        "teacher": "MALIGE P.",
                        "group": "[1 SPE B P NSI MAL]",
                        "room": "C 03-04 STI2D",
                        "gradient": "linear-gradient(180deg, #3C784F 0%, #61C581 100%)",
                        "height": 102,
                        "canceled": False,
                    },
                    {
                        "id": "m2",
                        "start": "10h00",
                        "end": "12h00",
                        "subject": "ESPAGNOL LV2",
                        "location_tag": "PAUILLAC",
                        "teacher": "GARCIA M.",
                        "group": "[1 LV2 ESP]",
                        "room": "A 104",
                        "gradient": "linear-gradient(180deg, #0F2B6B 0%, #2A4D9B 100%)",
                        "height": 102,
                        "canceled": False,
                    },
                    {
                        "id": "m-lunch",
                        "start": "12h00",
                        "end": "13h00",
                        "is_lunch": True,
                        "gradient": "linear-gradient(180deg, #8D8D8D 0%, #E2E2E2 100%)",
                        "height": 39,
                    },
                    {
                        "id": "m3",
                        "start": "13h00",
                        "end": "15h00",
                        "subject": "HUMAN.LITTER.PHILO.",
                        "location_tag": "PAUILLAC",
                        "teacher": "SEGUELA P.",
                        "group": "[1 SPE A P HLP TA/SEG]",
                        "room": "D 106",
                        "gradient": "linear-gradient(180deg, #2B038C 0%, #4A06F2 100%)",
                        "height": 102,
                        "canceled": False,
                    },
                    {
                        "id": "m4",
                        "start": "15h30",
                        "end": "17h00",
                        "subject": "ENSEIGN.SCIENTIFIQUE",
                        "location_tag": "PAUILLAC",
                        "teacher": "ROUSSEAU J.",
                        "group": "[1 G1 ES]",
                        "room": "LABO 2",
                        "gradient": "linear-gradient(180deg, #0369A1 0%, #0EA5E9 100%)",
                        "height": 102,
                        "canceled": False,
                    },
                ],
                "canteen": {
                    "subtitle": "Bon appétit !",
                    "items": [
                        "Carottes râpées au citron",
                        "Lasagnes bolognaise maison & Salade verte",
                        "Mousse au chocolat noir",
                    ],
                },
            },
        },
        "homeworks": [
            {
                "id": "hw-1",
                "date_label": "lundi 7 sept.",
                "subject": "NUMERIQUE.SC.INFORM.",
                "description": "",
                "done": True,
                "type": "submission",  # Shows Component 7: "Copie déposée" with delete confirmation
                "submission_deleted": False,
                "gradient": "linear-gradient(180deg, #3C784F 0%, #61C581 100%)",
                "teacher": "MALIGE P.",
                "given_on": "03 sept.",
            },
            {
                "id": "hw-2",
                "date_label": "lundi 7 sept.",
                "subject": "NUMERIQUE.SC.INFORM.",
                "description": "Remplir votre travail Python sur Capytale.",
                "done": False,
                "type": "checkbox",  # Shows Component 8: "J'ai terminé" + "Non fait" / "Fait"
                "gradient": "linear-gradient(180deg, #3C784F 0%, #61C581 100%)",
                "teacher": "MALIGE P.",
                "given_on": "04 sept.",
            },
            {
                "id": "hw-3",
                "date_label": "jeudi 10 sept.",
                "subject": "ESPAGNOL LV2",
                "description": "Memorizar minimo 6 palabras del vocabulario",
                "done": False,
                "type": "checkbox",
                "gradient": "linear-gradient(180deg, #0F2B6B 0%, #2A4D9B 100%)",
                "teacher": "GARCIA M.",
                "given_on": "05 sept.",
            },
        ],
        "resources": [
            {
                "id": "res-1",
                "subject": "NUMERIQUE SC.INFORM.",
                "teacher": "MALIGE P.",
                "date": "lun. 07 sept.",
                "title": "TP1 — Structures de données et listes en Python",
                "description": "Introduction aux listes par compréhension, tuples et dictionnaires. Exercices sur Capytale (code : a8f4-92b).",
                "files": ["TP1_Listes_Python_NSI.pdf", "corrige_intro.py"],
                "gradient": "linear-gradient(180deg, #3C784F 0%, #61C581 100%)",
            },
            {
                "id": "res-2",
                "subject": "HUMAN.LITTER.PHILO.",
                "teacher": "SEGUELA P.",
                "date": "lun. 07 sept.",
                "title": "Les pouvoirs de la parole — De l'Antiquité à l'âge classique",
                "description": "Analyse comparée de Gorgias (Platon) et de l'Art de persuader (Pascal).",
                "files": ["Corpus_Parole_HLP.pdf"],
                "gradient": "linear-gradient(180deg, #2B038C 0%, #4A06F2 100%)",
            },
            {
                "id": "res-3",
                "subject": "FRANÇAIS",
                "teacher": "ALINDRE N.",
                "date": "lun. 07 sept.",
                "title": "Objet d'étude : La poésie du XIXe au XXIe siècle",
                "description": "Méthodologie du commentaire composé et étude linéaire n°1 (Baudelaire, Les Fleurs du Mal).",
                "files": ["Methode_Commentaire_EAF.pdf", "Texte1_Albatros.pdf"],
                "gradient": "linear-gradient(180deg, #1B208C 0%, #121AD2 100%)",
            },
            {
                "id": "res-4",
                "subject": "MATHS SPECIFIQUES.",
                "teacher": "GATA L.",
                "date": "lun. 07 sept.",
                "title": "Chapitre 1 : Proportions, pourcentages et évolutions",
                "description": "Cours complet et fiche d'exercices d'entraînement.",
                "files": ["Chap1_Evolutions_Maths.pdf"],
                "gradient": "linear-gradient(180deg, #00561F 0%, #019034 100%)",
            },
        ],
        "grades": [
            {
                "id": "g1",
                "subject": "NUMERIQUE SC.INFORM.",
                "teacher": "MALIGE P.",
                "title": "TP Noté Python — Capytale",
                "date": "07/09/2026",
                "grade": "18,00",
                "out_of": "20",
                "coeff": "2",
                "class_avg": "14,20",
                "min": "08,50",
                "max": "19,50",
                "gradient": "linear-gradient(180deg, #3C784F 0%, #61C581 100%)",
            },
            {
                "id": "g2",
                "subject": "HUMAN.LITTER.PHILO.",
                "teacher": "SEGUELA P.",
                "title": "Essai philosophique — La parole",
                "date": "06/09/2026",
                "grade": "15,50",
                "out_of": "20",
                "coeff": "2",
                "class_avg": "12,80",
                "min": "07,00",
                "max": "17,50",
                "gradient": "linear-gradient(180deg, #2B038C 0%, #4A06F2 100%)",
            },
            {
                "id": "g3",
                "subject": "FRANÇAIS",
                "teacher": "ALINDRE N.",
                "title": "Explication linéaire — Baudelaire",
                "date": "05/09/2026",
                "grade": "16,00",
                "out_of": "20",
                "coeff": "1",
                "class_avg": "13,10",
                "min": "06,50",
                "max": "18,00",
                "gradient": "linear-gradient(180deg, #1B208C 0%, #121AD2 100%)",
            },
            {
                "id": "g4",
                "subject": "MATHS SPECIFIQUES.",
                "teacher": "GATA L.",
                "title": "Interrogation — Taux d'évolution",
                "date": "04/09/2026",
                "grade": "14,50",
                "out_of": "20",
                "coeff": "1",
                "class_avg": "11,90",
                "min": "05,00",
                "max": "19,00",
                "gradient": "linear-gradient(180deg, #00561F 0%, #019034 100%)",
            },
            {
                "id": "g5",
                "subject": "ESPAGNOL LV2",
                "teacher": "GARCIA M.",
                "title": "Vocabulario y compréhension orale",
                "date": "03/09/2026",
                "grade": "17,00",
                "out_of": "20",
                "coeff": "1",
                "class_avg": "14,60",
                "min": "09,00",
                "max": "19,00",
                "gradient": "linear-gradient(180deg, #0F2B6B 0%, #2A4D9B 100%)",
            },
        ],
        "averages": [
            {
                "subject": "NUMERIQUE SC.INFORM.",
                "teacher": "MALIGE P.",
                "student_avg": "18,00",
                "class_avg": "14,20",
                "min": "08,50",
                "max": "19,50",
                "appreciation": "Excellent début d'année. Un investissement remarquable en programmation Python.",
                "gradient": "linear-gradient(180deg, #3C784F 0%, #61C581 100%)",
            },
            {
                "subject": "HUMAN.LITTER.PHILO.",
                "teacher": "SEGUELA P.",
                "student_avg": "15,50",
                "class_avg": "12,80",
                "min": "07,00",
                "max": "17,50",
                "appreciation": "Réflexion fine et structurée. Participation orale très pertinente.",
                "gradient": "linear-gradient(180deg, #2B038C 0%, #4A06F2 100%)",
            },
            {
                "subject": "FRANÇAIS",
                "teacher": "ALINDRE N.",
                "student_avg": "16,00",
                "class_avg": "13,10",
                "min": "06,50",
                "max": "18,00",
                "appreciation": "Travail sérieux et analyses littéraires déjà très solides.",
                "gradient": "linear-gradient(180deg, #1B208C 0%, #121AD2 100%)",
            },
            {
                "subject": "MATHS SPECIFIQUES.",
                "teacher": "GATA L.",
                "student_avg": "14,50",
                "class_avg": "11,90",
                "min": "05,00",
                "max": "19,00",
                "appreciation": "Bon ensemble, méthodes bien comprises. Continuez ainsi.",
                "gradient": "linear-gradient(180deg, #00561F 0%, #019034 100%)",
            },
            {
                "subject": "ESPAGNOL LV2",
                "teacher": "GARCIA M.",
                "student_avg": "17,00",
                "class_avg": "14,60",
                "min": "09,00",
                "max": "19,00",
                "appreciation": "Très bonne implication à l'oral comme à l'écrit.",
                "gradient": "linear-gradient(180deg, #0F2B6B 0%, #2A4D9B 100%)",
            },
        ],
        "competences": [
            {
                "id": "c1",
                "subject": "NUMERIQUE SC.INFORM.",
                "teacher": "MALIGE P.",
                "domain": "Langages et programmation",
                "skill": "Concevoir et implémenter un algorithme en Python",
                "level": "A+",
                "level_label": "Très bonne maîtrise",
                "date": "07/09/2026",
            },
            {
                "id": "c2",
                "subject": "HUMAN.LITTER.PHILO.",
                "teacher": "SEGUELA P.",
                "domain": "Les pouvoirs de la parole",
                "skill": "Problématiser et argumenter à l'écrit",
                "level": "A",
                "level_label": "Maîtrise satisfaisante",
                "date": "06/09/2026",
            },
            {
                "id": "c3",
                "subject": "FRANÇAIS",
                "teacher": "ALINDRE N.",
                "domain": "Lecture et analyse littéraire",
                "skill": "Mobiliser des procédés stylistiques dans une explication linéaire",
                "level": "A+",
                "level_label": "Très bonne maîtrise",
                "date": "05/09/2026",
            },
            {
                "id": "c4",
                "subject": "PIX / Compétences Numériques",
                "teacher": "MALIGE P.",
                "domain": "Sécurité & Données",
                "skill": "Gérer des données structurées et sécuriser son environnement numérique",
                "level": "A+",
                "level_label": "Très bonne maîtrise (Niveau 5)",
                "date": "04/09/2026",
            },
        ],
        "agenda": [
            {
                "id": "ag-1",
                "day": "18",
                "month": "oct.",
                "title": "Vacances de la Toussaint",
                "subtitle": "Du 18 oct. au 1 nov.",
            },
            {
                "id": "ag-2",
                "day": "11",
                "month": "nov.",
                "title": "Armistice 1918",
                "subtitle": "Le 11 nov.",
            },
            {
                "id": "ag-3",
                "day": "20",
                "month": "déc.",
                "title": "Vacances de Noël",
                "subtitle": "Du 20 déc. au 3 janv.",
            },
            {
                "id": "ag-4",
                "day": "15",
                "month": "jan.",
                "title": "Conseil de classe 1er Semestre",
                "subtitle": "Le 15 janv. à 17h30",
            },
            {
                "id": "ag-5",
                "day": "14",
                "month": "fév.",
                "title": "Vacances d'Hiver (Zone A)",
                "subtitle": "Du 14 fév. au 1 mars",
            },
            {
                "id": "ag-6",
                "day": "21",
                "month": "mar.",
                "title": "Journée Portes Ouvertes — Lycée Odilon Redon",
                "subtitle": "Le 21 mars de 9h00 à 16h00",
            },
            {
                "id": "ag-7",
                "day": "11",
                "month": "avr.",
                "title": "Vacances de Printemps (Zone A)",
                "subtitle": "Du 11 avr. au 26 avr.",
            },
            {
                "id": "ag-8",
                "day": "08",
                "month": "mai",
                "title": "Victoire 1945",
                "subtitle": "Le 8 mai",
            },
            {
                "id": "ag-9",
                "day": "12",
                "month": "juin",
                "title": "Épreuves Anticipées de Français (EAF)",
                "subtitle": "Du 12 juin au 22 juin",
            },
        ],
        "informations": [
            {
                "id": "inf-1",
                "title": "Rentrée scolaire & Fonctionnement Lycée Connecté",
                "author": "Direction — Lycée Odilon Redon (Pauillac)",
                "date": "02 sept. 2026",
                "category": "Vie de l'établissement",
                "read": True,
                "content": "Bienvenue à tous les élèves pour cette nouvelle année scolaire au Lycée Odilon Redon de Pauillac. L'accès aux ressources numériques et à Pronote s'effectue via vos identifiants ÉduConnect.",
            },
            {
                "id": "inf-2",
                "title": "Inscription aux ateliers UNSS et Maison des Lycéens (MDL)",
                "author": "Vie Scolaire — Pauillac",
                "date": "05 sept. 2026",
                "category": "Activités & Clubs",
                "read": False,
                "content": "Les inscriptions pour l'Association Sportive (UNSS) et les clubs de la MDL sont ouvertes toute la semaine au foyer des élèves entre 12h00 et 13h00.",
            },
        ],
        "discussions": [
            {
                "id": "disc-1",
                "subject": "Accès aux notebooks Capytale (Spécialité NSI)",
                "participants": "MALIGE P. (Professeur NSI)",
                "date": "Hier à 16h40",
                "unread": False,
                "messages": [
                    {
                        "sender": "MALIGE P.",
                        "date": "06 sept. 16:40",
                        "body": "Bonjour à tous, le premier TP Python est disponible sur Capytale via votre ENT Lycée Connecté. N'oubliez pas de cliquer sur 'J'ai terminé' une fois le travail validé.",
                    }
                ],
            },
            {
                "id": "disc-2",
                "subject": "Lecture cursive — Les Fleurs du Mal",
                "participants": "ALINDRE N. (Professeur Français)",
                "date": "04 sept.",
                "unread": False,
                "messages": [
                    {
                        "sender": "ALINDRE N.",
                        "date": "04 sept. 18:15",
                        "body": "Bonjour, pensez à apporter votre édition des Fleurs du Mal de Charles Baudelaire pour la séance de lundi après-midi en salle G 106.",
                    }
                ],
            },
        ],
        "vie_scolaire": {
            "carnet_empty_message": "Votre carnet est vide, vous êtes blanc comme neige.",
            "absences": [],
            "retards": [],
            "punitions": [],
            "observations": [],
        },
        "forums": [
            {
                "id": "f1",
                "subject": "NUMERIQUE SC.INFORM.",
                "teacher": "MALIGE P.",
                "title": "Entraide TP1 Python & Capytale",
                "posts_count": 4,
                "last_update": "Aujourd'hui à 14h10",
            },
            {
                "id": "f2",
                "subject": "HUMAN.LITTER.PHILO.",
                "teacher": "SEGUELA P.",
                "title": "Questions sur l'essai philosophique (Gorgias / Pascal)",
                "posts_count": 2,
                "last_update": "Hier à 18h20",
            },
        ],
        "documents": [
            {
                "id": "doc-1",
                "title": "Certificat de scolarité 2026-2027",
                "category": "Administratif",
                "date": "01/09/2026",
                "size": "142 Ko",
            },
            {
                "id": "doc-2",
                "title": "Règlement intérieur — Lycée Odilon Redon (Pauillac)",
                "category": "Vie scolaire",
                "date": "01/09/2026",
                "size": "380 Ko",
            },
            {
                "id": "doc-3",
                "title": "Attestation d'assurance scolaire",
                "category": "Vie scolaire",
                "date": "02/09/2026",
                "size": "215 Ko",
            },
        ],
    }


ALLOWED_HTML_TAGS = {
    "p", "br", "b", "strong", "i", "em", "u", "s", "span", "div",
    "ul", "ol", "li", "a", "h1", "h2", "h3", "h4", "blockquote", "hr", "sub", "sup",
}
DANGEROUS_HTML_TAGS = {"script", "style", "iframe", "object", "embed", "form", "input", "meta", "link"}
ALLOWED_STYLE_PROPS = {"color", "background-color", "font-weight", "font-style", "text-decoration"}


def _sanitize_html(raw: Any) -> str:
    """Preserves safe rich formatting (bold, italic, underline, colors, lists, links) while stripping scripts."""
    if not raw:
        return ""
    if callable(raw):
        try:
            raw = raw()
        except Exception:
            return ""
    text = unescape(str(raw))
    if "<" not in text or ">" not in text:
        return text.replace("\n", "<br/>").strip()

    soup = BeautifulSoup(text, "html.parser")
    for bad in soup.find_all(DANGEROUS_HTML_TAGS):
        bad.decompose()

    for tag in list(soup.find_all(True)):
        if tag.name not in ALLOWED_HTML_TAGS:
            tag.unwrap()
            continue

        new_attrs: Dict[str, Any] = {}
        if tag.name == "a":
            href = str(tag.attrs.get("href", "")).strip()
            if href.startswith(("http://", "https://", "mailto:")):
                new_attrs["href"] = href
                new_attrs["target"] = "_blank"
                new_attrs["rel"] = "noopener noreferrer"

        raw_style = tag.attrs.get("style", "")
        if isinstance(raw_style, str) and raw_style.strip():
            safe_parts = []
            for decl in raw_style.split(";"):
                if ":" not in decl:
                    continue
                prop, val = decl.split(":", 1)
                prop_l = prop.strip().lower()
                val_s = val.strip()
                if prop_l in ALLOWED_STYLE_PROPS and val_s and "url(" not in val_s.lower() and "expression" not in val_s.lower():
                    safe_parts.append(f"{prop_l}: {val_s}")
            if safe_parts:
                new_attrs["style"] = "; ".join(safe_parts)

        tag.attrs = new_attrs

    return str(soup).strip()


# Preserve Pronote rich formatting (bold, italic, colors, lists, links) inside pronotepy
pronotepy.dataClasses.Util.html_parse = staticmethod(_sanitize_html)


def _clean_html_text(raw: Any) -> str:
    if not raw:
        return ""
    if callable(raw):
        try:
            raw = raw()
        except Exception:
            return ""
    if not isinstance(raw, str):
        raw = str(raw)
    if "<" in raw and ">" in raw:
        return BeautifulSoup(raw, "html.parser").get_text("\n", strip=True)
    return raw.strip()


def _format_dt(val: Any, fmt: str = "%d/%m/%Y") -> str:
    if not val:
        return ""
    if isinstance(val, (datetime.datetime, datetime.date)):
        return val.strftime(fmt)
    return str(val)


def _bytes_to_image_data_uri(raw: Any) -> str:
    """Validates image magic bytes so HTML 404s never become broken data URIs."""
    if not isinstance(raw, (bytes, bytearray)) or len(raw) < 12:
        return ""
    b = bytes(raw)
    if b.startswith(b"\xff\xd8\xff"):
        mime = "image/jpeg"
    elif b.startswith(b"\x89PNG\r\n\x1a\n"):
        mime = "image/png"
    elif b.startswith((b"GIF87a", b"GIF89a")):
        mime = "image/gif"
    elif b.startswith(b"RIFF") and b[8:12] == b"WEBP":
        mime = "image/webp"
    else:
        return ""
    return f"data:{mime};base64," + base64.b64encode(b).decode("ascii")


def _find_inline_base64_image(obj: Any, depth: int = 0) -> str:
    """Recursively searches Pronote JSON dicts/lists for an inline base64 JPEG/PNG photo."""
    if depth > 6 or obj is None:
        return ""
    if isinstance(obj, str):
        s = obj.strip()
        if len(s) > 100:
            if s.startswith("data:image/"):
                return s
            if s.startswith("/9j/"):
                return "data:image/jpeg;base64," + s
            if s.startswith("iVBOR"):
                return "data:image/png;base64," + s
        return ""
    if isinstance(obj, dict):
        # Prioritize keys mentioning photo
        for k, v in obj.items():
            if "photo" in str(k).lower():
                found = _find_inline_base64_image(v, depth + 1)
                if found:
                    return found
        for v in obj.values():
            found = _find_inline_base64_image(v, depth + 1)
            if found:
                return found
    elif isinstance(obj, (list, tuple)):
        for item in obj:
            found = _find_inline_base64_image(item, depth + 1)
            if found:
                return found
    return ""


def _extract_profile_picture(client: Any, info: Any) -> str:
    """Extracts the student's profile photo from Pronote (inline base64 in PRONOTE 2026 or FichiersExternes)."""
    if not info:
        return ""

    # 1. PRONOTE 2026 embeds the photo as inline base64 in ParametresUtilisateur or PageInfosPerso
    for source in (
        getattr(info, "raw_resource", None),
        getattr(client, "parametres_utilisateur", None),
    ):
        found = _find_inline_base64_image(source)
        if found:
            return found

    try:
        cache_fn = getattr(info, "_cache", None)
        if callable(cache_fn):
            found = _find_inline_base64_image(cache_fn())
            if found:
                return found
    except Exception:
        pass

    comm = getattr(client, "communication", None)
    sess = getattr(comm, "session", None) if comm else None

    try:
        pic = getattr(info, "profile_picture", None)
        if pic:
            pic_url = getattr(pic, "url", None)
            if pic_url and sess:
                resp = sess.get(pic_url, timeout=8)
                if resp.status_code == 200:
                    uri = _bytes_to_image_data_uri(resp.content)
                    if uri:
                        return uri
            else:
                pic_bytes = getattr(pic, "data", None)
                uri = _bytes_to_image_data_uri(pic_bytes)
                if uri:
                    return uri
    except Exception:
        pass

    raw_res = getattr(info, "raw_resource", None) or {}
    if isinstance(raw_res, dict) and raw_res.get("N") and comm and sess:
        try:
            from Crypto.Util.Padding import pad as crypto_pad
            enc_obj = getattr(comm, "encryption", None)
            root_site = getattr(comm, "root_site", "")
            session_h = (getattr(client, "attributes", None) or {}).get("h", "")
            if enc_obj and root_site and session_h:
                g_val = raw_res.get("G", 4)
                candidates = [
                    {"N": raw_res["N"], "G": g_val, "L": "photo.jpg"},
                    {"N": raw_res["N"], "G": g_val, "Actif": True},
                    {"N": raw_res["N"], "Actif": True, "G": g_val},
                ]
                for payload in candidates:
                    try:
                        raw_json = json.dumps(payload).replace(" ", "").encode()
                        magic = enc_obj.aes_encrypt(crypto_pad(raw_json, 16)).hex()
                        url = f"{root_site}/FichiersExternes/{magic}/photo.jpg?Session={session_h}"
                        resp = sess.get(url, timeout=6)
                        if resp.status_code == 200:
                            uri = _bytes_to_image_data_uri(resp.content)
                            if uri:
                                return uri
                    except Exception:
                        continue
        except Exception:
            pass

    return ""


def _serialize_attachments(files: Any) -> List[Dict[str, str]]:
    res: List[Dict[str, str]] = []
    for f in files or []:
        name = getattr(f, "name", None) or "Pièce jointe"
        url = getattr(f, "url", None) or ""
        res.append({"name": str(name), "url": str(url)})
    return res


def build_empty_real_state() -> Dict[str, Any]:
    """Clean empty structure for real Pronote sessions so demo data never leaks."""
    return {
        "is_live_pronote": True,
        "user": {
            "name": "Élève connecté",
            "class_name": "Lycée Odilon Redon",
            "establishment": "Lycée Odilon Redon — Pauillac (0332081H)",
            "ine": "0332081H",
            "email": "",
            "phone": "",
            "address": "",
            "delegue": False,
            "regime": "Demi-pensionnaire",
            "profile_picture": "",
        },
        "sticky_note": "",
        "days": {},
        "homeworks": [],
        "resources": [],
        "periods": [],
        "current_period_id": "",
        "grades": [],
        "averages": [],
        "overall_average": "",
        "class_overall_average": "",
        "competences": [],
        "agenda": [],
        "informations": [],
        "discussions": [],
        "vie_scolaire": {
            "carnet_empty_message": "Votre carnet est vide, vous êtes blanc comme neige.",
            "absences": [],
            "retards": [],
            "punitions": [],
            "observations": [],
        },
        "forums": [],
        "documents": [],
        "extraction_warnings": [],
    }


def _extract_period_details(period: Any, p_idx: int) -> Dict[str, Any]:
    """Safely extracts grades, averages, report, competences, and vie scolaire for a single Period."""
    p_id = str(getattr(period, "id", f"p-{p_idx}"))
    p_name = getattr(period, "name", f"Période {p_idx + 1}")

    p_grades: List[Dict[str, Any]] = []
    try:
        for idx, g in enumerate(getattr(period, "grades", []) or []):
            try:
                subj = getattr(g.subject, "name", "MATIÈRE") if getattr(g, "subject", None) else "MATIÈRE"
                p_grades.append({
                    "id": str(getattr(g, "id", f"real-g-{p_id}-{idx}")),
                    "subject": subj,
                    "teacher": "",
                    "title": getattr(g, "comment", "") or "Évaluation",
                    "date": _format_dt(getattr(g, "date", None)),
                    "date_iso": g.date.isoformat() if getattr(g, "date", None) else "",
                    "grade": str(getattr(g, "grade", "")),
                    "out_of": str(getattr(g, "out_of", "20")),
                    "coeff": str(getattr(g, "coefficient", "1")),
                    "class_avg": str(getattr(g, "average", "")),
                    "min": str(getattr(g, "min", "")),
                    "max": str(getattr(g, "max", "")),
                    "is_bonus": bool(getattr(g, "is_bonus", False)),
                    "is_optionnal": bool(getattr(g, "is_optionnal", False)),
                    "gradient": get_subject_gradient(subj),
                })
            except Exception:
                continue
        p_grades.sort(key=lambda x: x.get("date_iso", ""), reverse=True)
    except Exception:
        pass

    p_averages: List[Dict[str, Any]] = []
    try:
        for a in getattr(period, "averages", []) or []:
            try:
                subj = getattr(a.subject, "name", "MATIÈRE") if getattr(a, "subject", None) else "MATIÈRE"
                p_averages.append({
                    "subject": subj,
                    "teacher": "",
                    "student_avg": str(getattr(a, "student", "")),
                    "class_avg": str(getattr(a, "class_average", "")),
                    "min": str(getattr(a, "min", "")),
                    "max": str(getattr(a, "max", "")),
                    "appreciation": "",
                    "gradient": get_subject_gradient(subj),
                })
            except Exception:
                continue
    except Exception:
        pass

    report_data = None
    try:
        rep = period.report
        if rep:
            rep_subjects = []
            for rs in getattr(rep, "subjects", []) or []:
                rs_name = getattr(rs, "name", "")
                rep_subjects.append({
                    "subject": rs_name,
                    "student_avg": str(getattr(rs, "student", "")),
                    "class_avg": str(getattr(rs, "class_average", "")),
                    "min": str(getattr(rs, "min", "")),
                    "max": str(getattr(rs, "max", "")),
                    "appreciations": list(getattr(rs, "comments", []) or []),
                    "gradient": get_subject_gradient(rs_name),
                })
            report_data = {
                "comments": list(getattr(rep, "comments", []) or []),
                "subjects": rep_subjects,
            }
            app_map = {s["subject"]: " ".join(s["appreciations"]) for s in rep_subjects if s["appreciations"]}
            for avg_item in p_averages:
                if avg_item["subject"] in app_map:
                    avg_item["appreciation"] = app_map[avg_item["subject"]]
    except Exception:
        pass

    p_competences: List[Dict[str, Any]] = []
    try:
        for ev_idx, ev in enumerate(getattr(period, "evaluations", []) or []):
            try:
                ev_subj = getattr(ev.subject, "name", "MATIÈRE") if getattr(ev, "subject", None) else "MATIÈRE"
                ev_teacher = getattr(ev, "teacher", "") or ""
                ev_date = _format_dt(getattr(ev, "date", None))
                ev_name = getattr(ev, "name", "") or "Évaluation"
                acqs = getattr(ev, "acquisitions", None) or []
                if acqs:
                    for acq_idx, acq in enumerate(acqs):
                        p_competences.append({
                            "id": f"real-comp-{p_id}-{ev_idx}-{acq_idx}",
                            "subject": ev_subj,
                            "teacher": ev_teacher,
                            "domain": getattr(acq, "domain", None) or getattr(ev, "domain", None) or ev_name,
                            "skill": getattr(acq, "name", None) or ev_name,
                            "level": getattr(acq, "abbreviation", None) or "—",
                            "level_label": getattr(acq, "level", None) or "",
                            "date": ev_date,
                        })
                else:
                    p_competences.append({
                        "id": f"real-comp-{p_id}-{ev_idx}",
                        "subject": ev_subj,
                        "teacher": ev_teacher,
                        "domain": getattr(ev, "domain", None) or ev_subj,
                        "skill": ev_name,
                        "level": "✓",
                        "level_label": getattr(ev, "description", None) or "Évalué",
                        "date": ev_date,
                    })
            except Exception:
                continue
    except Exception:
        pass

    p_absences: List[Dict[str, Any]] = []
    try:
        for ab_idx, ab in enumerate(getattr(period, "absences", []) or []):
            p_absences.append({
                "id": str(getattr(ab, "id", f"abs-{p_id}-{ab_idx}")),
                "from_date": _format_dt(getattr(ab, "from_date", None), "%d/%m/%Y %H:%M"),
                "to_date": _format_dt(getattr(ab, "to_date", None), "%d/%m/%Y %H:%M"),
                "justified": bool(getattr(ab, "justified", False)),
                "hours": str(getattr(ab, "hours", "") or ""),
                "days": getattr(ab, "days", 0) or 0,
                "reasons": list(getattr(ab, "reasons", []) or []),
            })
    except Exception:
        pass

    p_delays: List[Dict[str, Any]] = []
    try:
        for dl_idx, dl in enumerate(getattr(period, "delays", []) or []):
            p_delays.append({
                "id": str(getattr(dl, "id", f"del-{p_id}-{dl_idx}")),
                "date": _format_dt(getattr(dl, "date", None), "%d/%m/%Y %H:%M"),
                "minutes": getattr(dl, "minutes", 0) or 0,
                "justified": bool(getattr(dl, "justified", False)),
                "justification": getattr(dl, "justification", "") or "",
                "reasons": list(getattr(dl, "reasons", []) or []),
            })
    except Exception:
        pass

    p_punishments: List[Dict[str, Any]] = []
    try:
        for pu_idx, pu in enumerate(getattr(period, "punishments", []) or []):
            p_punishments.append({
                "id": str(getattr(pu, "id", f"pun-{p_id}-{pu_idx}")),
                "date": _format_dt(getattr(pu, "given", None)),
                "giver": getattr(pu, "giver", "") or "",
                "nature": getattr(pu, "nature", "") or "Punition",
                "reasons": list(getattr(pu, "reasons", []) or []),
                "circumstances": getattr(pu, "circumstances", "") or "",
                "duration": str(getattr(pu, "duration", "") or ""),
                "homework": getattr(pu, "homework", "") or "",
                "exclusion": bool(getattr(pu, "exclusion", False)),
            })
    except Exception:
        pass

    overall_avg = getattr(period, "overall_average", None)
    class_overall_avg = getattr(period, "class_overall_average", None)

    return {
        "id": p_id,
        "name": p_name,
        "start": _format_dt(getattr(period, "start", None)),
        "end": _format_dt(getattr(period, "end", None)),
        "loaded": True,
        "overall_average": str(overall_avg) if overall_avg not in (None, "") else "",
        "class_overall_average": str(class_overall_avg) if class_overall_avg not in (None, "") else "",
        "grades": p_grades,
        "averages": p_averages,
        "report": report_data,
        "competences": p_competences,
        "absences": p_absences,
        "delays": p_delays,
        "punishments": p_punishments,
    }


def extract_real_pronote_state(
    client: pronotepy.Client,
    existing_sticky_note: str = "",
) -> tuple[Dict[str, Any], Dict[str, Dict[str, Any]]]:
    """
    Extracts real student data from Pronote 0332081H (Lycée Odilon Redon - Pauillac)
    and formats it into the exact structure used by our Figma interface.
    Returns (state_dict, refs_dict) where refs_dict holds live pronotepy objects for mutations.
    """
    state = build_empty_real_state()
    state["sticky_note"] = existing_sticky_note
    refs: Dict[str, Dict[str, Any]] = {
        "homeworks": {},
        "informations": {},
        "discussions": {},
    }
    warnings: List[str] = []

    # 1. Student info + profile picture
    info = getattr(client, "info", None)
    if info:
        addr = getattr(info, "address", None)
        addr_str = " ".join(addr) if isinstance(addr, (list, tuple)) else str(addr or "")
        profile_pic_data_uri = _extract_profile_picture(client, info)
        state["user"] = {
            "name": getattr(info, "name", "Élève connecté"),
            "class_name": getattr(info, "class_name", "Lycée Odilon Redon"),
            "establishment": getattr(info, "establishment", "Lycée Odilon Redon — Pauillac (0332081H)"),
            "ine": getattr(info, "ine_number", "") or "0332081H",
            "email": getattr(info, "email", "") or "",
            "phone": getattr(info, "phone", "") or "",
            "address": addr_str.strip(),
            "delegue": bool(getattr(info, "delegue", False)),
            "regime": "Demi-pensionnaire",
            "profile_picture": profile_pic_data_uri,
        }

    # 2. Timetable + Lesson Contents (Resources) + Canteen Menus
    today = datetime.date.today()
    monday = today - datetime.timedelta(days=today.weekday())
    start_date = monday - datetime.timedelta(days=14)
    end_date = monday + datetime.timedelta(days=11)

    fr_days = ["lun.", "mar.", "mer.", "jeu.", "ven.", "sam.", "dim."]
    fr_months = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."]

    try:
        raw_lessons = client.lessons(start_date, end_date)
    except Exception as e:
        raw_lessons = []
        warnings.append(f"Emploi du temps: {e}")

    # Fetch canteen menus (Repas de midi & Repas du soir)
    menus_by_date: Dict[str, Dict[str, List[str]]] = {}
    try:
        raw_menus = client.menus(monday - datetime.timedelta(days=3), end_date) or []
        for m in raw_menus:
            m_date = getattr(m, "date", None)
            if not m_date:
                continue
            iso_m = m_date.isoformat() if isinstance(m_date, datetime.date) else str(m_date)[:10]
            dishes: List[str] = []
            for field in ("first_meal", "main_meal", "side_meal", "cheese", "dessert", "other_meal"):
                for food in getattr(m, field, None) or []:
                    fname = getattr(food, "name", None)
                    if fname:
                        dishes.append(str(fname))
            if dishes:
                entry = menus_by_date.setdefault(iso_m, {"lunch": [], "dinner": []})
                if getattr(m, "is_dinner", False) and not getattr(m, "is_lunch", True):
                    entry["dinner"] = dishes
                elif getattr(m, "is_dinner", False) and entry["lunch"]:
                    entry["dinner"] = dishes
                else:
                    entry["lunch"] = dishes
    except Exception as e:
        warnings.append(f"Menus cantine: {e}")

    days_dict: Dict[str, Any] = {}
    resources_list: List[Dict[str, Any]] = []
    seen_resource_keys = set()
    agenda_events: List[Dict[str, Any]] = []

    total_days = (end_date - start_date).days + 1
    for offset in range(total_days):
        d = start_date + datetime.timedelta(days=offset)
        day_lessons = [l for l in raw_lessons if l.start.date() == d]
        # Skip weekends unless there are actual lessons
        if d.weekday() >= 5 and not day_lessons:
            continue

        iso = d.isoformat()
        label = f"{fr_days[d.weekday()]} {d.day:02d} {fr_months[d.month - 1]}"
        try:
            pronote_week = client.get_week(d)
        except Exception:
            pronote_week = d.isocalendar()[1]
        week_q = "Semaine Q1" if (pronote_week % 2 == 1) else "Semaine Q2"
        day_lessons = [l for l in raw_lessons if l.start.date() == d]
        day_lessons.sort(key=lambda x: x.start)

        formatted_lessons = []
        lunch_inserted = False
        prev_lesson = None
        for idx, l in enumerate(day_lessons):
            if not lunch_inserted and l.start.hour >= 13:
                lunch_start = (
                    f"{prev_lesson.end.hour}h{prev_lesson.end.minute:02d}"
                    if prev_lesson and prev_lesson.end.hour < 13
                    else "12h00"
                )
                lunch_end = f"{l.start.hour}h{l.start.minute:02d}"
                formatted_lessons.append({
                    "id": f"{iso}-lunch",
                    "start": lunch_start,
                    "end": lunch_end,
                    "is_lunch": True,
                    "gradient": "linear-gradient(180deg, #8D8D8D 0%, #E2E2E2 100%)",
                    "height": 39,
                })
                lunch_inserted = True
            elif prev_lesson is not None:
                same_half_day = (prev_lesson.end.hour < 13 and l.start.hour < 13) or (
                    prev_lesson.end.hour >= 13 and l.start.hour >= 13
                )
                gap_minutes = (l.start - prev_lesson.end).total_seconds() / 60.0
                if same_half_day and gap_minutes >= 45:
                    formatted_lessons.append({
                        "id": f"{iso}-gap-{idx}",
                        "start": f"{prev_lesson.end.hour}h{prev_lesson.end.minute:02d}",
                        "end": f"{l.start.hour}h{l.start.minute:02d}",
                        "is_gap": True,
                        "label": "Pas de cours",
                        "height": 42,
                    })
            prev_lesson = l

            subj = (
                getattr(l.subject, "name", "COURS")
                if getattr(l, "subject", None)
                else (getattr(l, "detention", None) or "COURS")
            )
            teacher_name = getattr(l, "teacher_name", "") or ", ".join(getattr(l, "teacher_names", []) or [])
            room_name = getattr(l, "classroom", "") or ", ".join(getattr(l, "classrooms", []) or [])
            group_name = getattr(l, "group_name", "") or ", ".join(getattr(l, "group_names", []) or [])
            dur_hours = max(1.0, (l.end - l.start).total_seconds() / 3600.0)
            canceled = bool(getattr(l, "canceled", False))
            status = getattr(l, "status", None)
            is_test = bool(getattr(l, "test", False))
            is_outing = bool(getattr(l, "outing", False))
            is_exempted = bool(getattr(l, "exempted", False))
            memo = getattr(l, "memo", None) or ""

            formatted_lessons.append({
                "id": f"{iso}-{idx}",
                "start": f"{l.start.hour}h{l.start.minute:02d}",
                "end": f"{l.end.hour}h{l.end.minute:02d}",
                "subject": subj,
                "location_tag": "PAUILLAC",
                "teacher": teacher_name,
                "group": f"[{group_name}]" if group_name else "",
                "room": room_name,
                "gradient": get_subject_gradient(subj),
                "height": 102 if dur_hours >= 1.5 else 86,
                "canceled": canceled,
                "status": status,
                "test": is_test,
                "outing": is_outing,
                "exempted": is_exempted,
                "memo": memo,
                "virtual_classrooms": getattr(l, "virtual_classrooms", []) or [],
            })

            # Extract lesson content (Cahier de textes -> Contenus et ressources)
            content_obj = getattr(l, "content", None)
            if content_obj:
                c_title = getattr(content_obj, "title", None) or getattr(content_obj, "category", None) or f"Séance de {subj}"
                raw_c_desc = getattr(content_obj, "description", "")
                c_desc_html = _sanitize_html(raw_c_desc)
                c_desc = _clean_html_text(raw_c_desc)
                c_files = _serialize_attachments(getattr(content_obj, "files", None))
                res_key = (iso, subj, c_title, c_desc[:40])
                if (c_title or c_desc or c_files) and res_key not in seen_resource_keys:
                    seen_resource_keys.add(res_key)
                    resources_list.append({
                        "id": f"real-res-{len(resources_list)}",
                        "subject": subj,
                        "teacher": teacher_name,
                        "date": label,
                        "date_iso": iso,
                        "title": c_title,
                        "description": c_desc,
                        "description_html": c_desc_html,
                        "files": c_files,
                        "gradient": get_subject_gradient(subj),
                    })

            # Add tests / outings to agenda if upcoming
            if d >= today and (is_test or is_outing):
                agenda_events.append({
                    "id": f"ag-lesson-{iso}-{idx}",
                    "day": f"{d.day:02d}",
                    "month": fr_months[d.month - 1],
                    "title": f"{'Devoir / Évaluation' if is_test else 'Sortie scolaire'} — {subj}",
                    "subtitle": f"{label} à {l.start.hour}h{l.start.minute:02d} ({room_name or 'Lycée'})",
                    "sort_date": iso,
                })

        canteen_entry = menus_by_date.get(iso, {"lunch": [], "dinner": []})
        canteen_lunch = canteen_entry.get("lunch", [])
        canteen_dinner = canteen_entry.get("dinner", [])
        has_menu = bool(canteen_lunch or canteen_dinner)
        days_dict[iso] = {
            "label": label,
            "week": week_q,
            "lessons": formatted_lessons,
            "canteen": {
                "subtitle": "Bon appétit !" if has_menu else "Aucun menu communiqué",
                "items": canteen_lunch or canteen_dinner,
                "lunch": canteen_lunch,
                "dinner": canteen_dinner,
            },
        }

    state["days"] = days_dict
    # Most recent resources first
    resources_list.sort(key=lambda x: x.get("date_iso", ""), reverse=True)
    state["resources"] = resources_list

    # 3. Homework (starting from today)
    try:
        raw_hw = client.homework(today, today + datetime.timedelta(days=30)) or []
        raw_hw.sort(key=lambda h: h.date)
        hw_list = []
        fr_full_days = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"]
        for idx, h in enumerate(raw_hw):
            hw_id = str(getattr(h, "id", None) or f"real-hw-{idx}")
            subj = getattr(h.subject, "name", "MATIÈRE") if getattr(h, "subject", None) else "MATIÈRE"
            if h.date == today:
                d_label = "aujourd'hui"
            elif h.date == today + datetime.timedelta(days=1):
                d_label = "demain"
            else:
                d_label = f"{fr_full_days[h.date.weekday()]} {h.date.day} {fr_months[h.date.month - 1]}"
            raw_hw_desc = getattr(h, "description", "")
            hw_files = _serialize_attachments(getattr(h, "files", None))
            hw_list.append({
                "id": hw_id,
                "date_label": d_label,
                "date_iso": h.date.isoformat() if isinstance(h.date, datetime.date) else "",
                "subject": subj,
                "description": _clean_html_text(raw_hw_desc),
                "description_html": _sanitize_html(raw_hw_desc),
                "done": bool(getattr(h, "done", False)),
                "type": "checkbox",
                "gradient": get_subject_gradient(subj),
                "teacher": "",
                "given_on": "",
                "files": hw_files,
            })
            refs["homeworks"][hw_id] = h
        state["homeworks"] = hw_list
    except Exception as e:
        warnings.append(f"Travail à faire: {e}")

    # 4. Periods: Fetch current period immediately for fast login; other periods load lazily via /api/period/{id}
    try:
        all_periods = list(getattr(client, "periods", []) or [])
        current_period = getattr(client, "current_period", None)
        current_period_id = str(getattr(current_period, "id", "")) if current_period else ""
        if not current_period_id and all_periods:
            current_period_id = str(getattr(all_periods[0], "id", "p-0"))

        periods_data: List[Dict[str, Any]] = []
        refs["periods"] = {}

        for p_idx, period in enumerate(all_periods):
            p_id = str(getattr(period, "id", f"p-{p_idx}"))
            p_name = getattr(period, "name", f"Période {p_idx + 1}")
            refs["periods"][p_id] = period
            if p_id == current_period_id:
                periods_data.append(_extract_period_details(period, p_idx))
            else:
                periods_data.append({
                    "id": p_id,
                    "name": p_name,
                    "start": _format_dt(getattr(period, "start", None)),
                    "end": _format_dt(getattr(period, "end", None)),
                    "loaded": False,
                    "overall_average": "",
                    "class_overall_average": "",
                    "grades": [],
                    "averages": [],
                    "report": None,
                    "competences": [],
                    "absences": [],
                    "delays": [],
                    "punishments": [],
                })

        active_p = next((p for p in periods_data if p["id"] == current_period_id), periods_data[0] if periods_data else None)

        # If current period has 0 grades (e.g. start of new trimester/semester), also load previous period so grades are visible
        if active_p and len(active_p.get("grades", [])) == 0 and len(all_periods) > 1:
            for p_idx in range(len(all_periods) - 1, -1, -1):
                p_obj = all_periods[p_idx]
                p_id = str(getattr(p_obj, "id", f"p-{p_idx}"))
                if p_id == current_period_id:
                    continue
                loaded_p = _extract_period_details(p_obj, p_idx)
                periods_data[p_idx] = loaded_p
                if len(loaded_p.get("grades", [])) > 0:
                    active_p = loaded_p
                    current_period_id = p_id
                    break

        state["current_period_id"] = current_period_id
        state["periods"] = periods_data

        if active_p:
            state["grades"] = active_p.get("grades", [])
            state["averages"] = active_p.get("averages", [])
            state["overall_average"] = active_p.get("overall_average", "")
            state["class_overall_average"] = active_p.get("class_overall_average", "")
            state["competences"] = active_p.get("competences", [])
            all_absences = active_p.get("absences", [])
            all_delays = active_p.get("delays", [])
            all_punishments = active_p.get("punishments", [])
        else:
            all_absences, all_delays, all_punishments = [], [], []

        total_vs = len(all_absences) + len(all_delays) + len(all_punishments)
        state["vie_scolaire"] = {
            "carnet_empty_message": (
                "Votre carnet est vide, vous êtes blanc comme neige."
                if total_vs == 0
                else f"{len(all_absences)} absence(s), {len(all_delays)} retard(s), {len(all_punishments)} punition(s)"
            ),
            "absences": all_absences,
            "retards": all_delays,
            "punitions": all_punishments,
            "observations": [],
        }
    except Exception as e:
        warnings.append(f"Notes & Périodes: {e}")

    # 5. Informations & Sondages (fault-tolerant per item)
    try:
        raw_infos = client.information_and_surveys() or []
        infos = []
        for idx, inf in enumerate(raw_infos):
            try:
                inf_id = str(getattr(inf, "id", None) or f"real-inf-{idx}")
                dt = getattr(inf, "start_date", None) or getattr(inf, "creation_date", None)
                is_survey = bool(getattr(inf, "survey", False))
                try:
                    content_attr = getattr(inf, "content", "")
                    raw_content = content_attr() if callable(content_attr) else content_attr
                except Exception:
                    raw_content = ""
                try:
                    atts_attr = getattr(inf, "attachments", None)
                    raw_atts = atts_attr() if callable(atts_attr) else atts_attr
                except Exception:
                    raw_atts = None

                infos.append({
                    "id": inf_id,
                    "title": getattr(inf, "title", None) or "Information",
                    "author": getattr(inf, "author", None) or "Lycée Odilon Redon",
                    "date": _format_dt(dt),
                    "date_iso": dt.isoformat() if isinstance(dt, (datetime.date, datetime.datetime)) else "",
                    "category": getattr(inf, "category", None) or ("Sondage" if is_survey else "Information"),
                    "is_survey": is_survey,
                    "read": bool(getattr(inf, "read", False)),
                    "content": _clean_html_text(raw_content),
                    "content_html": _sanitize_html(raw_content),
                    "attachments": _serialize_attachments(raw_atts),
                })
                refs["informations"][inf_id] = inf
            except Exception as item_err:
                warnings.append(f"Info #{idx}: {item_err}")
        infos.sort(key=lambda x: x.get("date_iso", ""), reverse=True)
        state["informations"] = infos
    except Exception as e:
        warnings.append(f"Informations & Sondages: {e}")

    # 6. Discussions & Messages (fault-tolerant per item)
    try:
        raw_discs = client.discussions() or []
        discs = []
        for idx, d in enumerate(raw_discs):
            try:
                disc_id = f"real-disc-{idx}"
                creator_str = str(getattr(d, "creator", "") or "")
                raw_participants = getattr(d, "participants", None)
                if callable(raw_participants):
                    try:
                        raw_participants = raw_participants()
                    except Exception:
                        raw_participants = None
                if isinstance(raw_participants, (list, tuple)):
                    part_str = ", ".join(str(p) for p in raw_participants if p)
                else:
                    part_str = str(raw_participants or creator_str or "Professeur")

                msgs = []
                try:
                    raw_msgs = getattr(d, "messages", None) or []
                except Exception:
                    raw_msgs = []
                for m in raw_msgs:
                    raw_m_body = getattr(m, "content", "")
                    msgs.append({
                        "id": str(getattr(m, "id", "")),
                        "sender": str(getattr(m, "author", "") or "Expéditeur"),
                        "date": _format_dt(getattr(m, "date", None), "%d/%m/%Y %H:%M"),
                        "body": _clean_html_text(raw_m_body),
                        "body_html": _sanitize_html(raw_m_body),
                        "seen": bool(getattr(m, "seen", True)),
                    })

                discs.append({
                    "id": disc_id,
                    "subject": getattr(d, "subject", None) or "Discussion",
                    "participants": part_str,
                    "creator": creator_str,
                    "date": _format_dt(getattr(d, "date", None), "%d/%m/%Y %H:%M"),
                    "unread": bool(getattr(d, "unread", False)),
                    "replyable": bool(getattr(d, "replyable", True)),
                    "closed": bool(getattr(d, "closed", False)),
                    "messages": msgs,
                })
                refs["discussions"][disc_id] = d
            except Exception as item_err:
                warnings.append(f"Discussion #{idx}: {item_err}")
        state["discussions"] = discs
    except Exception as e:
        warnings.append(f"Discussions: {e}")

    # 7. Agenda: combine upcoming school events, upcoming informations, and Zone A holidays (Pauillac / Bordeaux)
    zone_a_holidays = [
        {"id": "vac-noel", "day": "20", "month": "déc.", "title": "Vacances de Noël", "subtitle": "Du 20 déc. au 3 janv.", "sort_date": "2026-12-20"},
        {"id": "vac-hiver", "day": "14", "month": "fév.", "title": "Vacances d'hiver", "subtitle": "Du 14 févr. au 28 févr.", "sort_date": "2027-02-14"},
        {"id": "vac-printemps", "day": "11", "month": "avr.", "title": "Vacances de printemps", "subtitle": "Du 11 avr. au 25 avr.", "sort_date": "2027-04-11"},
        {"id": "ferie-1mai", "day": "01", "month": "mai", "title": "Fête du Travail", "subtitle": "Le 1er mai 2027", "sort_date": "2027-05-01"},
        {"id": "ferie-8mai", "day": "08", "month": "mai", "title": "Victoire 1945", "subtitle": "Le 8 mai 2027", "sort_date": "2027-05-08"},
        {"id": "vac-ete", "day": "03", "month": "juil.", "title": "Vacances d'été", "subtitle": "À partir du 3 juillet 2027", "sort_date": "2027-07-03"},
    ]
    today_iso = today.isoformat()
    seen_agenda_titles = {ev.get("title", "") for ev in agenda_events}
    for inf in state.get("informations", []):
        inf_iso = (inf.get("date_iso") or "")[:10]
        if inf_iso and inf_iso >= today_iso and inf.get("title") and inf["title"] not in seen_agenda_titles:
            try:
                d_inf = datetime.date.fromisoformat(inf_iso)
                seen_agenda_titles.add(inf["title"])
                agenda_events.append({
                    "id": f"ag-inf-{inf['id']}",
                    "day": f"{d_inf.day:02d}",
                    "month": fr_months[d_inf.month - 1],
                    "title": inf["title"],
                    "subtitle": f"Le {d_inf.day:02d} {fr_months[d_inf.month - 1]} • {inf.get('category', 'Information')}",
                    "sort_date": inf_iso,
                })
            except Exception:
                pass
    combined_agenda = agenda_events + [h for h in zone_a_holidays if h["sort_date"] >= today_iso]
    combined_agenda.sort(key=lambda x: x.get("sort_date", ""))
    state["agenda"] = combined_agenda
    state["extraction_warnings"] = warnings

    return state, refs


class LoginRequest(BaseModel):
    username: Optional[str] = None
    password: Optional[str] = None
    qr_json: Optional[str] = None
    pin: Optional[str] = None
    mode: str = "educonnect"  # "educonnect" | "qrcode" | "demo"


class EduConnectVerifyRequest(BaseModel):
    challenge_id: str
    code: Optional[str] = None
    values: Optional[Dict[str, str]] = None
    choice_name: Optional[str] = None
    choice_value: Optional[str] = None


class HomeworkToggleRequest(BaseModel):
    homework_id: str


class StickyNoteRequest(BaseModel):
    content: str


class InfoMarkReadRequest(BaseModel):
    info_id: str
    read: bool = True


class DiscussionReplyRequest(BaseModel):
    discussion_id: str
    message: str


class DiscussionMarkReadRequest(BaseModel):
    discussion_id: str
    unread: bool = False


class NewDiscussionRequest(BaseModel):
    subject: str
    message: str
    recipient_ids: List[str]


def get_or_create_session(authorization: Optional[str]) -> Dict[str, Any]:
    if authorization and authorization.startswith("Bearer "):
        token = authorization.replace("Bearer ", "").strip()
        if token in SESSIONS:
            return SESSIONS[token]
    raise HTTPException(
        status_code=401,
        detail="Authentification requise. Veuillez vous connecter avec votre compte ÉduConnect.",
    )


@app.get("/api/health")
def health_check():
    return {
        "status": "ok",
        "establishment": "Lycée Odilon Redon — Pauillac (0332081H)",
        "pronote_server": PRONOTE_URL,
        "ent_sso": "https://educonnect.education.gouv.fr/idp/profile/SAML2/Unsolicited/SSO?providerId=https://mon.lyceeconnecte.fr/auth/saml/metadata/idp.xml",
    }


@app.post("/api/auth/login")
def login(req: LoginRequest):
    if req.mode == "demo":
        token = str(uuid.uuid4())
        state = build_default_demo_state()
        SESSIONS[token] = {
            "mode": "demo",
            "client": None,
            "state": state,
            "refs": {},
        }
        return {
            "token": token,
            "mode": "demo",
            "user": state["user"],
            "message": "Connecté au mode Aperçu Figma (Lycée Odilon Redon - Pauillac)",
        }

    if req.mode == "qrcode":
        if not req.qr_json or not req.pin:
            raise HTTPException(
                status_code=400,
                detail="Veuillez fournir le contenu JSON du QR Code Pronote et votre code PIN à 4 chiffres.",
            )
        try:
            qr_data = json.loads(req.qr_json.strip())
            client = pronotepy.Client.qrcode_login(
                qr_data,
                req.pin.strip(),
                uuid=str(uuid.uuid4()),
            )
            if not client.logged_in:
                raise HTTPException(status_code=401, detail="QR Code Pronote expiré ou code PIN invalide.")
            state, refs = extract_real_pronote_state(client)
            token = str(uuid.uuid4())
            SESSIONS[token] = {
                "mode": "real",
                "client": client,
                "state": state,
                "refs": refs,
            }
            return {
                "token": token,
                "mode": "real",
                "user": state["user"],
                "message": f"Connecté à PRONOTE 2026 par QR Code ({state['user']['name']})",
            }
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(
                status_code=401,
                detail=f"Échec de connexion par QR Code Pronote : {str(e)}",
            )

    if not req.username or not req.password:
        raise HTTPException(
            status_code=400,
            detail="Veuillez renseigner votre identifiant et votre mot de passe.",
        )

    try:
        if req.mode == "pronote":
            client = pronotepy.Client(
                PRONOTE_URL,
                username=req.username.strip(),
                password=req.password,
            )
        else:
            client = pronotepy.Client(
                PRONOTE_URL,
                username=req.username.strip(),
                password=req.password,
                ent=lyceeconnecte_pauillac_ent,
            )
        if not client.logged_in:
            raise HTTPException(
                status_code=401,
                detail="Identifiant ou mot de passe incorrect, ou compte non rattaché au Lycée Odilon Redon (0332081H).",
            )

        state, refs = extract_real_pronote_state(client)
        token = str(uuid.uuid4())
        SESSIONS[token] = {
            "mode": "real",
            "client": client,
            "state": state,
            "refs": refs,
        }
        return {
            "token": token,
            "mode": "real",
            "user": state["user"],
            "message": f"Connecté à PRONOTE 2026 ({state['user']['name']})",
        }
    except EduConnectVerificationRequired as ver:
        return {"requires_verification": True, **ver.payload}
    except HTTPException:
        raise
    except Exception as e:
        err_str = str(e)
        if "erreurs d'authentification" in err_str.lower() or "nombre d'erreurs" in err_str.lower():
            err_str = (
                "Pronote a temporairement bloqué les tentatives suite à plusieurs erreurs d'authentification. "
                "Patientez quelques minutes puis réessayez (ou utilisez un QR Code Pronote)."
            )
        raise HTTPException(
            status_code=401,
            detail=err_str,
        )


@app.post("/api/auth/educonnect-verify")
def verify_educonnect(req: EduConnectVerifyRequest):
    pending = PENDING_EDUCONNECT.get(req.challenge_id)
    if not pending:
        raise HTTPException(
            status_code=404,
            detail="Session de vérification ÉduConnect expirée. Veuillez recommencer la connexion.",
        )

    session: requests.Session = pending["session"]
    form_info: Dict[str, Any] = pending["form"]
    payload: Dict[str, str] = dict(form_info.get("hidden_fields") or {})

    input_name = form_info.get("input_name")
    if req.values:
        for k, v in req.values.items():
            payload[k] = (v or "").strip()
        # If ÉduConnect has a hidden combined date field (e.g. dateNaissance), populate JJ/MM/AAAA
        inputs_meta = form_info.get("inputs") or []
        if len(inputs_meta) == 3:
            v_list = [(req.values.get(m["name"]) or "").strip() for m in inputs_meta]
            if all(v.isdigit() for v in v_list):
                combined_dob = f"{v_list[0].zfill(2)}/{v_list[1].zfill(2)}/{v_list[2]}"
                for hk in list(payload.keys()):
                    if "date" in hk.lower() and not payload[hk]:
                        payload[hk] = combined_dob
    elif input_name and req.code is not None:
        payload[input_name] = req.code.strip()

    if req.choice_name:
        payload[req.choice_name] = req.choice_value or ""
    elif form_info.get("choices"):
        preferred = next(
            (
                c for c in form_info["choices"]
                if c.get("name") == "_eventId_proceed"
                or any(w in (c.get("label") or "").lower() for w in ("valider", "continuer", "confirmer"))
            ),
            form_info["choices"][0],
        )
        if preferred.get("name"):
            payload[preferred["name"]] = preferred.get("value", "")
    elif "_eventId_proceed" not in payload:
        payload["_eventId_proceed"] = ""

    try:
        print(f"[ENT Verify Submit] url={form_info['action_url']} keys={list(payload.keys())!r}", flush=True)
        r = session.post(form_info["action_url"], data=payload, timeout=15)
        soup = BeautifulSoup(r.text, "html.parser")
        v_title = soup.title.get_text(strip=True) if soup.title else ""
        print(f"[ENT Verify Resp] status={r.status_code} url={r.url} title={v_title!r}", flush=True)
        next_verif = _inspect_educonnect_verification_form(r, soup)
        if next_verif:
            pending["form"] = next_verif
            return {
                "requires_verification": True,
                "challenge_id": req.challenge_id,
                "title": next_verif["title"],
                "prompt": next_verif["prompt"],
                "inputs": next_verif["inputs"],
                "input_name": next_verif["input_name"],
                "input_label": next_verif["input_label"],
                "choices": next_verif["choices"],
                "error": next_verif["error"],
            }

        cookies = _finish_educonnect_saml_and_cas(session, r, soup, pending["pronote_url"])
        PENDING_EDUCONNECT.pop(req.challenge_id, None)
        session.close()

        client = pronotepy.Client(
            PRONOTE_URL,
            username=pending["username"],
            password=pending["password"],
            ent=lambda u, p, **kw: cookies,
        )
        if not client.logged_in:
            raise HTTPException(
                status_code=401,
                detail="Vérification réussie mais connexion à Pronote Pauillac refusée.",
            )

        state, refs = extract_real_pronote_state(client)
        token = str(uuid.uuid4())
        SESSIONS[token] = {
            "mode": "real",
            "client": client,
            "state": state,
            "refs": refs,
        }
        return {
            "token": token,
            "mode": "real",
            "user": state["user"],
            "message": f"Connecté à PRONOTE 2026 via ÉduConnect ({state['user']['name']})",
        }
    except HTTPException:
        raise
    except Exception as e:
        PENDING_EDUCONNECT.pop(req.challenge_id, None)
        try:
            session.close()
        except Exception:
            pass
        raise HTTPException(status_code=401, detail=str(e))


@app.get("/api/state")
def get_state(authorization: Optional[str] = Header(default=None)):
    sess = get_or_create_session(authorization)
    return {
        "mode": sess["mode"],
        "data": sess["state"],
    }


@app.post("/api/refresh")
def refresh_state(authorization: Optional[str] = Header(default=None)):
    sess = get_or_create_session(authorization)
    if sess["mode"] == "real" and sess.get("client"):
        client = sess["client"]
        old_state = sess["state"]
        old_refs = sess.get("refs", {})
        sticky = old_state.get("sticky_note", "")
        try:
            new_state, new_refs = extract_real_pronote_state(client, existing_sticky_note=sticky)
        except Exception:
            try:
                client.session_check()
                new_state, new_refs = extract_real_pronote_state(client, existing_sticky_note=sticky)
            except Exception:
                return {"mode": sess["mode"], "data": old_state}

        # Safe merge: never wipe non-empty sections if Pronote transiently returned empty
        for key in (
            "days",
            "homeworks",
            "resources",
            "periods",
            "grades",
            "averages",
            "competences",
            "informations",
            "discussions",
            "agenda",
        ):
            if not new_state.get(key) and old_state.get(key):
                new_state[key] = old_state[key]
                if key in ("homeworks", "informations", "discussions", "periods") and not new_refs.get(key):
                    new_refs[key] = old_refs.get(key, {})

        if new_state.get("periods") is old_state.get("periods"):
            for extra_key in ("overall_average", "class_overall_average", "vie_scolaire", "current_period_id"):
                if not new_state.get(extra_key) and old_state.get(extra_key):
                    new_state[extra_key] = old_state[extra_key]

        sess["state"] = new_state
        sess["refs"] = new_refs
    return {
        "mode": sess["mode"],
        "data": sess["state"],
    }


@app.get("/api/period/{period_id}")
def get_period_details(period_id: str, authorization: Optional[str] = Header(default=None)):
    sess = get_or_create_session(authorization)
    state = sess["state"]
    periods = state.get("periods", [])
    for idx, p in enumerate(periods):
        if p.get("id") == period_id:
            if p.get("loaded"):
                return {"ok": True, "period": p}
            period_ref = sess.get("refs", {}).get("periods", {}).get(period_id)
            if period_ref:
                loaded = _extract_period_details(period_ref, idx)
                periods[idx] = loaded
                return {"ok": True, "period": loaded}
            return {"ok": True, "period": p}
    raise HTTPException(status_code=404, detail="Période introuvable")


@app.post("/api/homework/toggle")
def toggle_homework(req: HomeworkToggleRequest, authorization: Optional[str] = Header(default=None)):
    sess = get_or_create_session(authorization)
    state = sess["state"]
    for hw in state.get("homeworks", []):
        if hw["id"] == req.homework_id:
            new_done = not hw["done"]
            hw["done"] = new_done
            hw_ref = sess.get("refs", {}).get("homeworks", {}).get(req.homework_id)
            if hw_ref:
                try:
                    hw_ref.set_done(new_done)
                except Exception as e:
                    client = sess.get("client")
                    retried = False
                    if client:
                        try:
                            client.session_check()
                            hw_ref.set_done(new_done)
                            retried = True
                        except Exception:
                            retried = False
                    if not retried:
                        hw["done"] = not new_done
                        raise HTTPException(
                            status_code=502,
                            detail=f"Erreur Pronote lors de la mise à jour du devoir : {e}",
                        )
            return {"ok": True, "homework": hw}
    raise HTTPException(status_code=404, detail="Devoir introuvable")


@app.post("/api/homework/delete-submission")
def delete_submission(req: HomeworkToggleRequest, authorization: Optional[str] = Header(default=None)):
    sess = get_or_create_session(authorization)
    state = sess["state"]
    for hw in state.get("homeworks", []):
        if hw["id"] == req.homework_id:
            hw["submission_deleted"] = True
            hw["type"] = "checkbox"
            hw["done"] = False
            return {"ok": True, "homework": hw}
    raise HTTPException(status_code=404, detail="Devoir introuvable")


@app.post("/api/sticky-note")
def save_sticky_note(req: StickyNoteRequest, authorization: Optional[str] = Header(default=None)):
    sess = get_or_create_session(authorization)
    sess["state"]["sticky_note"] = req.content
    return {"ok": True, "sticky_note": req.content}


@app.post("/api/information/mark-read")
def mark_information_read(req: InfoMarkReadRequest, authorization: Optional[str] = Header(default=None)):
    sess = get_or_create_session(authorization)
    state = sess["state"]
    for inf in state.get("informations", []):
        if inf["id"] == req.info_id:
            inf["read"] = req.read
            inf_ref = sess.get("refs", {}).get("informations", {}).get(req.info_id)
            if inf_ref:
                try:
                    inf_ref.mark_as_read(req.read)
                except Exception as e:
                    raise HTTPException(status_code=502, detail=f"Erreur Pronote : {e}")
            return {"ok": True, "information": inf}
    raise HTTPException(status_code=404, detail="Information introuvable")


@app.post("/api/discussion/reply")
def reply_discussion(req: DiscussionReplyRequest, authorization: Optional[str] = Header(default=None)):
    sess = get_or_create_session(authorization)
    if not req.message.strip():
        raise HTTPException(status_code=400, detail="Le message ne peut pas être vide.")
    state = sess["state"]
    for disc in state.get("discussions", []):
        if disc["id"] == req.discussion_id:
            disc_ref = sess.get("refs", {}).get("discussions", {}).get(req.discussion_id)
            if disc_ref:
                try:
                    disc_ref.reply(req.message.strip())
                except Exception as e:
                    raise HTTPException(status_code=502, detail=f"Impossible d'envoyer la réponse sur Pronote : {e}")
            now_str = datetime.datetime.now().strftime("%d/%m/%Y %H:%M")
            new_msg = {
                "id": f"msg-{uuid.uuid4()}",
                "sender": state.get("user", {}).get("name", "Moi"),
                "date": now_str,
                "body": req.message.strip(),
                "seen": True,
            }
            disc.setdefault("messages", []).append(new_msg)
            disc["unread"] = False
            return {"ok": True, "discussion": disc}
    raise HTTPException(status_code=404, detail="Discussion introuvable")


@app.post("/api/discussion/mark-read")
def mark_discussion_read(req: DiscussionMarkReadRequest, authorization: Optional[str] = Header(default=None)):
    sess = get_or_create_session(authorization)
    state = sess["state"]
    for disc in state.get("discussions", []):
        if disc["id"] == req.discussion_id:
            disc["unread"] = req.unread
            disc_ref = sess.get("refs", {}).get("discussions", {}).get(req.discussion_id)
            if disc_ref:
                try:
                    disc_ref.mark_as(req.unread)
                except Exception:
                    pass
            return {"ok": True, "discussion": disc}
    raise HTTPException(status_code=404, detail="Discussion introuvable")


@app.get("/api/discussion/recipients")
def get_discussion_recipients(authorization: Optional[str] = Header(default=None)):
    sess = get_or_create_session(authorization)
    if sess["mode"] != "real" or not sess.get("client"):
        return {
            "recipients": [
                {"id": "demo-1", "name": "MALIGE P. (Professeur NSI)", "type": "Teacher"},
                {"id": "demo-2", "name": "ALINDRE N. (Professeur Français)", "type": "Teacher"},
                {"id": "demo-3", "name": "Vie Scolaire — Pauillac", "type": "Staff"},
            ]
        }
    try:
        raw_rec = sess["client"].get_recipients() or []
        rec_list = []
        for r in raw_rec:
            if getattr(r, "with_discussion", True):
                rec_list.append({
                    "id": str(getattr(r, "id", "")),
                    "name": getattr(r, "name", "Destinataire"),
                    "type": str(getattr(r, "type", "")),
                })
        return {"recipients": rec_list}
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Impossible de récupérer les destinataires : {e}")


@app.post("/api/discussion/new")
def create_discussion(req: NewDiscussionRequest, authorization: Optional[str] = Header(default=None)):
    sess = get_or_create_session(authorization)
    if not req.subject.strip() or not req.message.strip() or not req.recipient_ids:
        raise HTTPException(status_code=400, detail="Veuillez renseigner un objet, un message et au moins un destinataire.")
    state = sess["state"]
    if sess["mode"] == "real" and sess.get("client"):
        try:
            raw_rec = sess["client"].get_recipients() or []
            selected = [r for r in raw_rec if str(getattr(r, "id", "")) in req.recipient_ids]
            if not selected:
                raise HTTPException(status_code=400, detail="Destinataires introuvables sur Pronote.")
            sess["client"].new_discussion(req.subject.strip(), req.message.strip(), selected)
            sticky = state.get("sticky_note", "")
            new_state, new_refs = extract_real_pronote_state(sess["client"], existing_sticky_note=sticky)
            sess["state"] = new_state
            sess["refs"] = new_refs
            return {"ok": True, "discussions": new_state["discussions"]}
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"Erreur lors de la création de la discussion : {e}")
    else:
        now_str = datetime.datetime.now().strftime("%d/%m/%Y %H:%M")
        new_disc = {
            "id": f"disc-{uuid.uuid4()}",
            "subject": req.subject.strip(),
            "participants": ", ".join(req.recipient_ids),
            "creator": state.get("user", {}).get("name", "Moi"),
            "date": now_str,
            "unread": False,
            "replyable": True,
            "closed": False,
            "messages": [
                {
                    "id": f"msg-{uuid.uuid4()}",
                    "sender": state.get("user", {}).get("name", "Moi"),
                    "date": now_str,
                    "body": req.message.strip(),
                    "seen": True,
                }
            ],
        }
        state.setdefault("discussions", []).insert(0, new_disc)
        return {"ok": True, "discussions": state["discussions"]}


# Serve production build if available so a single server can host both API + Web UI
FRONTEND_DIST = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "frontend", "dist"))
if os.path.isdir(FRONTEND_DIST):
    app.mount("/", StaticFiles(directory=FRONTEND_DIST, html=True), name="frontend")

