from dataclasses import dataclass, field
from uuid import UUID, uuid4

from gastoba.domain.email import Email
from gastoba.domain.excecoes import NomeInvalido
from gastoba.domain.senha import SenhaComHash

# Fixo para que a criação do usuário padrão seja idempotente; some quando existir login.
ID_USUARIO_PADRAO = UUID("00000000-0000-0000-0000-000000000001")

TAMANHO_MAXIMO_DO_NOME_DO_USUARIO = 100


@dataclass(slots=True, eq=False)
class Usuario:
    """Entidade: dono das contas e dos gastos.

    ``email`` e ``senha_hash`` são opcionais porque o usuário padrão herdado não os tem.
    """

    nome: str
    id: UUID = field(default_factory=uuid4)
    email: Email | None = None
    senha_hash: SenhaComHash | None = None

    def __post_init__(self) -> None:
        self.nome = self.nome.strip()
        if not self.nome:
            raise NomeInvalido("O nome do usuário não pode ser vazio.")
        if len(self.nome) > TAMANHO_MAXIMO_DO_NOME_DO_USUARIO:
            raise NomeInvalido(
                f"O nome do usuário deve ter no máximo "
                f"{TAMANHO_MAXIMO_DO_NOME_DO_USUARIO} caracteres."
            )

    @property
    def tem_credenciais(self) -> bool:
        """Só quem tem e-mail e senha pode entrar com senha."""
        return self.email is not None and self.senha_hash is not None

    def __eq__(self, outro: object) -> bool:
        if not isinstance(outro, Usuario):
            return NotImplemented
        return self.id == outro.id

    def __hash__(self) -> int:
        return hash(self.id)
