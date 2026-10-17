import re
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from enum import StrEnum
from uuid import UUID, uuid4

from gastoba.domain.excecoes import ExpiracaoInvalida, NomeDeChaveInvalido
from gastoba.domain.segredo_de_acesso import (
    TAMANHO_DO_PREFIXO_PUBLICO,
    tem_fuso_horario,
    validar_hash_sha256,
)

TAMANHO_MAXIMO_DO_NOME_DA_CHAVE = 60
# Evita uma escrita no banco a cada requisição feita com a chave.
INTERVALO_MINIMO_ENTRE_REGISTROS_DE_USO = timedelta(minutes=1)

_FORMATO_DO_PREFIXO = re.compile(rf"[A-Za-z0-9]{{{TAMANHO_DO_PREFIXO_PUBLICO}}}")


class EscopoDaChave(StrEnum):
    """O que a chave pode fazer: ``leitura`` (só consultas) ou ``escrita`` (e gravações)."""

    LEITURA = "leitura"
    ESCRITA = "escrita"

    def permite(self, necessario: EscopoDaChave) -> bool:
        return self is EscopoDaChave.ESCRITA or necessario is EscopoDaChave.LEITURA


@dataclass(slots=True, eq=False)
class ChaveDeApi:
    """Entidade: credencial criada por uma pessoa logada para um programa usar a API.

    Guarda só o hash do segredo; o ``prefixo`` público ajuda a pessoa a reconhecê-la.
    Sem ``expira_em``, vale até ser revogada.
    """

    usuario_id: UUID
    nome: str
    prefixo: str
    hash_do_segredo: str = field(repr=False)
    escopo: EscopoDaChave
    criada_em: datetime
    ultimo_uso: datetime | None = None
    expira_em: datetime | None = None
    revogada: bool = False
    id: UUID = field(default_factory=uuid4)

    def __post_init__(self) -> None:
        self.nome = self.nome.strip()
        if not self.nome:
            raise NomeDeChaveInvalido("O nome da chave de API não pode ser vazio.")
        if len(self.nome) > TAMANHO_MAXIMO_DO_NOME_DA_CHAVE:
            raise NomeDeChaveInvalido(
                f"O nome da chave de API deve ter no máximo "
                f"{TAMANHO_MAXIMO_DO_NOME_DA_CHAVE} caracteres."
            )
        if not _FORMATO_DO_PREFIXO.fullmatch(self.prefixo):
            raise ValueError(
                f"O prefixo da chave deve ter {TAMANHO_DO_PREFIXO_PUBLICO} letras ou dígitos."
            )
        validar_hash_sha256(self.hash_do_segredo)
        if not tem_fuso_horario(self.criada_em) or (
            self.ultimo_uso is not None and not tem_fuso_horario(self.ultimo_uso)
        ):
            raise ValueError("Os instantes da chave de API precisam ter fuso horário.")
        if self.expira_em is not None and not tem_fuso_horario(self.expira_em):
            raise ExpiracaoInvalida("A expiração da chave de API precisa ter fuso horário.")
        if self.expira_em is not None and self.expira_em <= self.criada_em:
            raise ExpiracaoInvalida("A chave de API precisa expirar depois de ser criada.")

    def esta_ativa(self, agora: datetime) -> bool:
        if self.revogada:
            return False
        return self.expira_em is None or agora < self.expira_em

    def permite(self, necessario: EscopoDaChave) -> bool:
        return self.escopo.permite(necessario)

    def revogar(self) -> None:
        self.revogada = True

    def registrar_uso(self, agora: datetime) -> bool:
        """Atualiza ``ultimo_uso`` se passou ao menos um minuto; diz se atualizou."""
        if (
            self.ultimo_uso is not None
            and agora - self.ultimo_uso < INTERVALO_MINIMO_ENTRE_REGISTROS_DE_USO
        ):
            return False
        self.ultimo_uso = agora
        return True

    def __eq__(self, outro: object) -> bool:
        if not isinstance(outro, ChaveDeApi):
            return NotImplemented
        return self.id == outro.id

    def __hash__(self) -> int:
        return hash(self.id)
