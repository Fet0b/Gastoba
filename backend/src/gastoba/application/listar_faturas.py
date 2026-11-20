from dataclasses import dataclass
from datetime import date
from uuid import UUID

from gastoba.domain.conta import TipoDaConta
from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.excecoes import ContaNaoEncontrada
from gastoba.domain.fatura import Fatura, SituacaoDaFatura
from gastoba.domain.portas import UnidadeDeTrabalho


@dataclass(frozen=True, slots=True)
class FaturaDoCartao:
    fatura: Fatura
    situacao: SituacaoDaFatura
    quantidade_de_compras: int


@dataclass(frozen=True, slots=True)
class CartaoComFaturas:
    conta_id: UUID
    conta_nome: str
    # O que o cartão deve hoje (o saldo da conta, sem o sinal); nunca negativo.
    valor_devido: Dinheiro
    faturas: list[FaturaDoCartao]


class ListarFaturas:
    def __init__(self, unidade_de_trabalho: UnidadeDeTrabalho) -> None:
        self._unidade_de_trabalho = unidade_de_trabalho

    def executar(
        self, usuario_id: UUID, hoje: date, conta_id: UUID | None = None
    ) -> list[CartaoComFaturas]:
        """Os cartões do usuário com suas faturas, da mais recente para a mais antiga."""
        with self._unidade_de_trabalho as uow:
            if conta_id is not None and uow.contas.obter(usuario_id, conta_id) is None:
                raise ContaNaoEncontrada("Conta não encontrada.")
            cartoes = [
                c
                for c in uow.contas.listar(usuario_id)
                if c.tipo is TipoDaConta.CARTAO and (conta_id is None or c.id == conta_id)
            ]
            faturas = uow.faturas.listar(usuario_id, conta_id)
            resultado = []
            for cartao in cartoes:
                do_cartao = [
                    FaturaDoCartao(
                        fatura=f,
                        situacao=f.situacao(hoje),
                        quantidade_de_compras=len(uow.faturas.compras_da_fatura(usuario_id, f.id)),
                    )
                    for f in faturas
                    if f.conta_id == cartao.id
                ]
                resultado.append(
                    CartaoComFaturas(
                        conta_id=cartao.id,
                        conta_nome=cartao.rotulo,
                        valor_devido=Dinheiro(max(0, -cartao.saldo.centavos)),
                        faturas=do_cartao,
                    )
                )
            return resultado
