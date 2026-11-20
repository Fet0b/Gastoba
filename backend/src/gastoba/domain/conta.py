from dataclasses import dataclass, field
from enum import StrEnum
from uuid import UUID, uuid4

from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.excecoes import ApelidoInvalido, NomeInvalido

TAMANHO_MAXIMO_DO_NOME_DA_CONTA = 100
TAMANHO_MAXIMO_DO_APELIDO = 40
DIGITOS_DO_FINAL = 4


def validar_apelido(texto: str) -> str:
    """Apara o apelido e confere 1 a 40 caracteres imprimíveis; ``ApelidoInvalido`` se não."""
    apelido = texto.strip()
    if not apelido or len(apelido) > TAMANHO_MAXIMO_DO_APELIDO or not apelido.isprintable():
        raise ApelidoInvalido(
            f"O apelido deve ter de 1 a {TAMANHO_MAXIMO_DO_APELIDO} caracteres imprimíveis."
        )
    return apelido


def final_do_numero_de(numero: object) -> str | None:
    """Os quatro últimos dígitos do número da conta como o banco o escreve.

    Só texto conta; tudo que não é dígito é ignorado; com menos de quatro dígitos não há final.
    O número inteiro nunca passa daqui.
    """
    if not isinstance(numero, str):
        return None
    digitos = "".join(c for c in numero if c in "0123456789")
    return digitos[-DIGITOS_DO_FINAL:] if len(digitos) >= DIGITOS_DO_FINAL else None


class OrigemDaConta(StrEnum):
    MANUAL = "manual"
    OPEN_FINANCE = "open_finance"


class PapelDaConta(StrEnum):
    CORRENTE = "corrente"
    INVESTIMENTO = "investimento"


class TipoDaConta(StrEnum):
    """Conta corrente (ou carteira, poupança) ou cartão de crédito."""

    CORRENTE = "corrente"
    CARTAO = "cartao"
    # Conta que aplica e resgata sozinha: o saldo é dinheiro investido (a caixinha), então não
    # entra no "dinheiro nas contas".
    REMUNERADA = "remunerada"


@dataclass(slots=True, eq=False)
class Conta:
    """Entidade: conta de um usuário (carteira, banco), com saldo que pode ficar negativo."""

    usuario_id: UUID
    nome: str
    saldo: Dinheiro
    origem: OrigemDaConta = OrigemDaConta.MANUAL
    # Id da conta no provedor de Open Finance; só nas contas importadas.
    id_externo: str | None = None
    id: UUID = field(default_factory=uuid4)
    tipo: TipoDaConta = TipoDaConta.CORRENTE
    papel: PapelDaConta | None = None
    # Da pessoa: como ela chama a conta.
    apelido: str | None = None
    # Do banco, atualizados a cada sincronização; só em conta importada.
    nome_no_banco: str | None = None
    final_do_numero: str | None = None

    def __post_init__(self) -> None:
        if self.apelido is not None:
            self.apelido = validar_apelido(self.apelido)
        if self.final_do_numero is not None and not (
            len(self.final_do_numero) == DIGITOS_DO_FINAL
            and all(c in "0123456789" for c in self.final_do_numero)
        ):
            raise ValueError("O final do número deve ter exatamente quatro dígitos.")
        self.nome = self.nome.strip()
        if not self.nome:
            raise NomeInvalido("O nome da conta não pode ser vazio.")
        if len(self.nome) > TAMANHO_MAXIMO_DO_NOME_DA_CONTA:
            raise NomeInvalido(
                f"O nome da conta deve ter no máximo {TAMANHO_MAXIMO_DO_NOME_DA_CONTA} caracteres."
            )

    @property
    def rotulo(self) -> str:
        """Como a conta aparece: o apelido, senão o nome no banco, senão o nome."""
        return self.apelido or self.nome_no_banco or self.nome

    @property
    def saldo_e_do_banco(self) -> bool:
        """Conta importada: o saldo espelha o do banco e lançamentos não o alteram."""
        return self.origem != OrigemDaConta.MANUAL

    def debitar(self, valor: Dinheiro) -> None:
        """Subtrai ``valor`` do saldo; ``ValorInvalido`` (do Dinheiro) se passar do limite."""
        self.saldo = self.saldo - valor

    def creditar(self, valor: Dinheiro) -> None:
        """Soma ``valor`` ao saldo; ``ValorInvalido`` (do Dinheiro) se passar do limite."""
        self.saldo = self.saldo + valor

    def __eq__(self, outro: object) -> bool:
        if not isinstance(outro, Conta):
            return NotImplemented
        return self.id == outro.id

    def __hash__(self) -> int:
        return hash(self.id)
