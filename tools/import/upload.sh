#!/usr/bin/env bash
# Importazione dello status quo da shell (bash + curl; su Windows: Git Bash o WSL).
# Uso: BUSINESS_URL=https://business.toscanadiagnostica.it BUSINESS_EMAIL=admin@... BUSINESS_PASSWORD='...' \
#      bash tools/import/upload.sh [--verify-only] pacchetto1.zip pacchetto2.zip ...
# Per ogni pacchetto esegue prima la verifica a secco, poi (se la verifica è pulita e non c'è --verify-only) l'importazione.
# Si ferma al primo errore. La password non viene mai stampata. Richiede un Superamministratore con password locale (l'accesso Microsoft 365
# non è replicabile da shell); se ha la verifica in due passaggi, lo script chiede il codice a 6 cifre (o lo legge da BUSINESS_TOTP).
set -euo pipefail
: "${BUSINESS_URL:?BUSINESS_URL mancante}" "${BUSINESS_EMAIL:?BUSINESS_EMAIL mancante}" "${BUSINESS_PASSWORD:?BUSINESS_PASSWORD mancante}"
VERIFY_ONLY=0; [ "${1:-}" = "--verify-only" ] && { VERIFY_ONLY=1; shift; }
[ $# -gt 0 ] || { echo "Nessun pacchetto indicato" >&2; exit 2; }
JAR=$(mktemp); trap 'rm -f "$JAR"' EXIT
API="${BUSINESS_URL%/}/api"
H=(-H 'X-Requested-With: td-business' -c "$JAR" -b "$JAR" -sS)
login=$(curl "${H[@]}" -X POST "$API/auth/login" -H 'content-type: application/json' \
  --data "$(printf '{"email":"%s","password":"%s"}' "$BUSINESS_EMAIL" "$BUSINESS_PASSWORD")")
case "$login" in
  *'"ok":true'*) ;;
  *totpRequired*)
    code="${BUSINESS_TOTP:-}"
    if [ -z "$code" ]; then read -r -p "Codice a 6 cifre dell'app di autenticazione: " code </dev/tty; fi
    login=$(curl "${H[@]}" -X POST "$API/auth/totp" -H 'content-type: application/json' --data "$(printf '{"code":"%s"}' "$code")")
    case "$login" in *'"ok":true'*) ;; *) echo "Codice non accettato: $login" >&2; exit 3 ;; esac ;;
  *) echo "Login fallito: $login" >&2; exit 3 ;;
esac
case "$login" in *PASSWORD_CHANGE_REQUIRED*) echo "L'account deve ancora cambiare la password temporanea: fallo dal browser e rilancia." >&2; exit 3 ;; esac

summarize() {
  local out; out=$(cat)
  echo "$out" | sed -e "s/.*\"counts\":{\([^}]*\)}.*/   $1: \1/" -e 's/"//g' -e 's/,/, /g'
  case "$out" in
    *'"ok":true'*'"errors":[]'*) return 0 ;;
    *) echo "   ERRORE: $out" | cut -c1-2000; return 1 ;;
  esac
}

for z in "$@"; do
  [ -f "$z" ] || { echo "File non trovato: $z" >&2; exit 2; }
  echo "== $(basename "$z")"
  curl "${H[@]}" -X POST "$API/import" -F "package=@$z" -F dry_run=1 | summarize verifica
  [ "$VERIFY_ONLY" = 1 ] && continue
  curl "${H[@]}" -X POST "$API/import" -F "package=@$z" -F dry_run=0 | summarize importazione
done
echo "Fatto."
