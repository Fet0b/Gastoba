from dataclasses import dataclass
from enum import StrEnum

from gastoba.domain.chave_de_api import EscopoDaChave
from gastoba.domain.excecoes import AcessoNegado
from gastoba.domain.usuario import Usuario


class MeioDeAutenticacao(StrEnum):
    SESSAO = "sessao"
    CHAVE_DE_API = "chave_de_api"


@dataclass(frozen=True, slots=True)
class Autenticacao:
    """Quem fez a requisição e por qual meio; a sessão tem todos os acessos (``escopo=None``)."""

    usuario: Usuario
    meio: MeioDeAutenticacao
    escopo: EscopoDaChave | None = None

    def __post_init__(self) -> None:
        if (self.meio is MeioDeAutenticacao.CHAVE_DE_API) != (self.escopo is not None):
            raise ValueError("Só a autenticação por chave de API tem escopo, e ela sempre tem.")


def exigir_escopo(autenticacao: Autenticacao, necessario: EscopoDaChave) -> None:
    """``AcessoNegado`` se a chave de API usada não tiver o escopo necessário."""
    if autenticacao.escopo is not None and not autenticacao.escopo.permite(necessario):
        raise AcessoNegado("A chave de API não tem permissão para esta operação.")


def exigir_sessao(autenticacao: Autenticacao) -> None:
    """``AcessoNegado`` para chave de API em operações exclusivas de sessão (ex.: gerir chaves)."""
    if autenticacao.meio is not MeioDeAutenticacao.SESSAO:
        raise AcessoNegado("Esta operação exige entrar com e-mail e senha.")
