from dataclasses import dataclass, field
from datetime import datetime
from uuid import UUID, uuid4

from gastoba.domain.excecoes import ExpiracaoInvalida
from gastoba.domain.segredo_de_acesso import tem_fuso_horario, validar_hash_sha256


@dataclass(slots=True, eq=False)
class Sessao:
    """Entidade: login de uma pessoa, com validade fixa (sem renovação) e revogável.

    Guarda só o hash do token; instantes em UTC, vindos do ``Relogio``.
    """

    usuario_id: UUID
    hash_do_segredo: str = field(repr=False)
    criada_em: datetime
    expira_em: datetime
    revogada: bool = False
    id: UUID = field(default_factory=uuid4)

    def __post_init__(self) -> None:
        validar_hash_sha256(self.hash_do_segredo)
        if not tem_fuso_horario(self.criada_em):
            raise ValueError("O instante de criação da sessão precisa ter fuso horário.")
        if not tem_fuso_horario(self.expira_em):
            raise ExpiracaoInvalida("A expiração da sessão precisa ter fuso horário.")
        if self.expira_em <= self.criada_em:
            raise ExpiracaoInvalida("A sessão precisa expirar depois de ser criada.")

    def esta_ativa(self, agora: datetime) -> bool:
        return not self.revogada and agora < self.expira_em

    def revogar(self) -> None:
        self.revogada = True

    def __eq__(self, outro: object) -> bool:
        if not isinstance(outro, Sessao):
            return NotImplemented
        return self.id == outro.id

    def __hash__(self) -> int:
        return hash(self.id)
