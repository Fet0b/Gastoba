from dataclasses import dataclass
from uuid import UUID

from gastoba.domain.ganho import OrigemDoGanho
from gastoba.domain.gasto import OrigemDoGasto
from gastoba.domain.portas import UnidadeDeTrabalho
from gastoba.domain.transacao_importada import (
    EstadoDaTransacaoImportada,
    SentidoDaTransacao,
    TransacaoImportada,
)


@dataclass(frozen=True, slots=True)
class ItemDaCaixaDeEntrada:
    transacao: TransacaoImportada
    sugerir_descarte: bool
    # Já existe um lançamento manual da mesma conta, no mesmo dia e com o mesmo valor.
    possivel_duplicado: bool


class ListarTransacoesImportadas:
    def __init__(self, unidade_de_trabalho: UnidadeDeTrabalho) -> None:
        self._unidade_de_trabalho = unidade_de_trabalho

    def executar(
        self,
        usuario_id: UUID,
        estado: EstadoDaTransacaoImportada = EstadoDaTransacaoImportada.PENDENTE,
    ) -> list[ItemDaCaixaDeEntrada]:
        """A caixa de entrada do usuário no estado dado, da data mais recente para a mais antiga."""
        with self._unidade_de_trabalho as uow:
            itens = []
            for transacao in uow.transacoes_importadas.listar(usuario_id, estado):
                itens.append(
                    ItemDaCaixaDeEntrada(
                        transacao=transacao,
                        sugerir_descarte=transacao.sugerir_descarte,
                        possivel_duplicado=self._ha_lancamento_manual_igual(
                            uow, usuario_id, transacao
                        ),
                    )
                )
            return itens

    @staticmethod
    def _ha_lancamento_manual_igual(
        uow: UnidadeDeTrabalho, usuario_id: UUID, transacao: TransacaoImportada
    ) -> bool:
        if transacao.sentido == SentidoDaTransacao.SAIDA:
            lancamentos = uow.gastos.listar(
                usuario_id, transacao.data, transacao.data, conta_id=transacao.conta_id
            )
            return any(
                g.valor == transacao.valor and g.origem == OrigemDoGasto.MANUAL for g in lancamentos
            )
        lancamentos = uow.ganhos.listar(
            usuario_id, transacao.data, transacao.data, conta_id=transacao.conta_id
        )
        return any(
            g.valor == transacao.valor and g.origem == OrigemDoGanho.MANUAL for g in lancamentos
        )
