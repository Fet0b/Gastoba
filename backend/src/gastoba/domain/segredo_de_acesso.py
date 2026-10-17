import hashlib
import re
from dataclasses import dataclass, field
from datetime import datetime
from enum import StrEnum

from gastoba.domain.excecoes import NaoAutenticado

PREFIXO_DE_SESSAO = "gsess_"
PREFIXO_DE_CHAVE_DE_API = "gapi_"
TAMANHO_DO_PREFIXO_PUBLICO = 8

# A parte aleatória vem do GeradorDeSegredo em base64 url-safe; o mínimo garante entropia
# (32 caracteres ≈ 192 bits) e o máximo barra tokens absurdos antes de qualquer consulta.
_TAMANHO_MAXIMO_DA_PARTE_ALEATORIA = 256
_PARTE_ALEATORIA = rf"[A-Za-z0-9_-]{{32,{_TAMANHO_MAXIMO_DA_PARTE_ALEATORIA}}}"
# Maior token válido (o de chave de API); conferido antes da regex e de qualquer hash.
TAMANHO_MAXIMO_DO_SEGREDO = (
    len(PREFIXO_DE_CHAVE_DE_API)
    + TAMANHO_DO_PREFIXO_PUBLICO
    + 1
    + _TAMANHO_MAXIMO_DA_PARTE_ALEATORIA
)
_FORMATO_DE_SESSAO = re.compile(rf"{PREFIXO_DE_SESSAO}{_PARTE_ALEATORIA}")
_FORMATO_DE_CHAVE_DE_API = re.compile(
    rf"{PREFIXO_DE_CHAVE_DE_API}(?P<prefixo>[A-Za-z0-9]{{{TAMANHO_DO_PREFIXO_PUBLICO}}})_"
    rf"{_PARTE_ALEATORIA}"
)
_FORMATO_SHA256 = re.compile(r"[0-9a-f]{64}")


def validar_hash_sha256(hash_do_segredo: str) -> None:
    """Garante que só o hash (nunca o segredo em claro) chegue às entidades."""
    if not _FORMATO_SHA256.fullmatch(hash_do_segredo):
        raise ValueError("O hash do segredo deve ser um SHA-256 hexadecimal minúsculo.")


def tem_fuso_horario(instante: datetime) -> bool:
    """Instantes sem fuso não se comparam com os do ``Relogio`` (UTC) e seriam ambíguos."""
    return instante.tzinfo is not None and instante.utcoffset() is not None


class TipoDeSegredo(StrEnum):
    SESSAO = "sessao"
    CHAVE_DE_API = "chave_de_api"


@dataclass(frozen=True, slots=True)
class SegredoDeAcesso:
    """Token opaco enviado em ``Authorization: Bearer``; o prefixo diz se é sessão ou chave.

    Formatos: ``gsess_<aleatório>`` (sessão) e ``gapi_<prefixo público>_<aleatório>`` (chave
    de API). Só o ``hash_sha256`` é gravado; o valor nunca aparece em repr/str/logs.
    Qualquer texto fora do formato levanta ``NaoAutenticado``.
    """

    valor: str = field(repr=False)

    @classmethod
    def de_texto(cls, texto: str) -> SegredoDeAcesso:
        return cls(texto)

    @classmethod
    def de_sessao(cls, aleatorio: str) -> SegredoDeAcesso:
        return cls(f"{PREFIXO_DE_SESSAO}{aleatorio}")

    @classmethod
    def de_chave_de_api(cls, prefixo_publico: str, aleatorio: str) -> SegredoDeAcesso:
        return cls(f"{PREFIXO_DE_CHAVE_DE_API}{prefixo_publico}_{aleatorio}")

    def __post_init__(self) -> None:
        if len(self.valor) > TAMANHO_MAXIMO_DO_SEGREDO or not (
            _FORMATO_DE_SESSAO.fullmatch(self.valor)
            or _FORMATO_DE_CHAVE_DE_API.fullmatch(self.valor)
        ):
            raise NaoAutenticado()

    @property
    def tipo(self) -> TipoDeSegredo:
        if self.valor.startswith(PREFIXO_DE_SESSAO):
            return TipoDeSegredo.SESSAO
        return TipoDeSegredo.CHAVE_DE_API

    @property
    def prefixo_publico(self) -> str | None:
        """Os 8 caracteres que identificam a chave na listagem; ``None`` para sessão."""
        encontrado = _FORMATO_DE_CHAVE_DE_API.fullmatch(self.valor)
        return encontrado["prefixo"] if encontrado else None

    @property
    def hash_sha256(self) -> str:
        """SHA-256 hexadecimal: o segredo tem entropia alta, então um hash rápido basta."""
        return hashlib.sha256(self.valor.encode()).hexdigest()

    def __repr__(self) -> str:
        return f"SegredoDeAcesso(tipo={self.tipo.value}, ***)"

    def __str__(self) -> str:
        return "***"
