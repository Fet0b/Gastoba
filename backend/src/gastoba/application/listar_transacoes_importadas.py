from dataclasses import dataclass
from datetime import timedelta
from uuid import UUID

from gastoba.domain.ganho import OrigemDoGanho
from gastoba.domain.gasto import OrigemDoGasto
from gastoba.domain.natureza_do_movimento import NaturezaDoMovimento, natureza_da_descricao
from gastoba.domain.portas import UnidadeDeTrabalho
from gastoba.domain.sugestao_de_investimento import sugerir_investimento
from gastoba.domain.transacao_importada import (
    EstadoDaTransacaoImportada,
    MotivoDaTransacaoIgnorada,
    SentidoDaTransacao,
    TransacaoImportada,
)
from gastoba.domain.transferencia_entre_contas import parear_transferencias


@dataclass(frozen=True, slots=True)
class ItemDaCaixaDeEntrada:
    transacao: TransacaoImportada
    sugerir_descarte: bool
    # Já existe um lançamento manual da mesma conta, no mesmo dia e com o mesmo valor.
    possivel_duplicado: bool
    # A posição de que a saída parece ser o aporte (a emissão); nulo sem sugestão.
    investimento_sugerido_id: UUID | None = None
    # A outra ponta provável de uma transferência entre contas próprias; nulo sem par inequívoco.
    par_sugerido_id: UUID | None = None


class ListarTransacoesImportadas:
    def __init__(self, unidade_de_trabalho: UnidadeDeTrabalho) -> None:
        self._unidade_de_trabalho = unidade_de_trabalho

    def executar(
        self,
        usuario_id: UUID,
        estado: EstadoDaTransacaoImportada = EstadoDaTransacaoImportada.PENDENTE,
        motivo: MotivoDaTransacaoIgnorada | None = None,
    ) -> list[ItemDaCaixaDeEntrada]:
        """A caixa de entrada do usuário no estado dado, da data mais recente para a mais antiga."""
        with self._unidade_de_trabalho as uow:
            transacoes = uow.transacoes_importadas.listar(usuario_id, estado)
            if motivo is not None:
                transacoes = [t for t in transacoes if t.motivo_ignorada == motivo]
            posicoes = []
            com_movimento: set[UUID] = set()
            if any(t.estado == EstadoDaTransacaoImportada.PENDENTE for t in transacoes):
                posicoes = uow.investimentos.listar_posicoes(usuario_id)
                com_movimento = uow.movimentos_de_investimento.investimentos_com_movimento(
                    usuario_id
                )
            historico = []
            if any(
                natureza_da_descricao(t.descricao) == NaturezaDoMovimento.LIQUIDACAO_DE_BOLSA
                for t in transacoes
            ):
                historico = uow.investimentos.historico(
                    usuario_id,
                    min(t.data for t in transacoes) - timedelta(days=30),
                    max(t.data for t in transacoes) + timedelta(days=7),
                )
            pares = parear_transferencias(transacoes)
            itens = []
            for transacao in transacoes:
                itens.append(
                    ItemDaCaixaDeEntrada(
                        transacao=transacao,
                        sugerir_descarte=transacao.sugerir_descarte,
                        possivel_duplicado=self._ha_lancamento_manual_igual(
                            uow, usuario_id, transacao
                        ),
                        par_sugerido_id=pares.get(transacao.id),
                        investimento_sugerido_id=sugerir_investimento(
                            transacao, posicoes, com_movimento, historico
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
