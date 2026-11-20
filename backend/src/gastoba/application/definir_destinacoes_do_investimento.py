from collections.abc import Sequence
from uuid import UUID

from gastoba.application.listar_movimentos_de_investimento import MovimentoComDestinacoes
from gastoba.domain.destinacao import (
    Destinacao,
    ParteDeDestinacao,
    dividir_por_percentuais,
    validar_destinacoes,
)
from gastoba.domain.excecoes import InvestimentoNaoEncontrado, SemValorADestinar
from gastoba.domain.investimento import valor_sem_destinacao
from gastoba.domain.mes import hoje_no_fuso_do_negocio
from gastoba.domain.movimento_de_investimento import MovimentoDeInvestimento
from gastoba.domain.portas import Relogio, UnidadeDeTrabalho


class DefinirDestinacoesDoInvestimento:
    def __init__(self, unidade_de_trabalho: UnidadeDeTrabalho, relogio: Relogio) -> None:
        self._unidade_de_trabalho = unidade_de_trabalho
        self._relogio = relogio

    def executar(
        self, usuario_id: UUID, investimento_id: UUID, destinacoes: Sequence[Destinacao]
    ) -> MovimentoComDestinacoes:
        """Reparte entre as destinações a parte da posição que ainda não tem principal.

        Grava um aporte de saldo inicial, sem conta, com data de hoje (em Brasília): não muda
        saldo de conta, gasto nem renda, e não conta na meta de Investimentos.
        """
        with self._unidade_de_trabalho as uow:
            investimento = uow.investimentos.obter(usuario_id, investimento_id)
            if investimento is None:
                raise InvestimentoNaoEncontrado("Investimento não encontrado.")
            validar_destinacoes(destinacoes)
            principais = uow.destinacoes.principais(usuario_id).get(investimento.id, {})
            valor = valor_sem_destinacao(investimento, principais)
            if valor.centavos == 0:
                raise SemValorADestinar(
                    "Todo o valor deste investimento já tem destinação; use a realocação."
                )
            movimento = MovimentoDeInvestimento.de_saldo_inicial(
                investimento.id, valor, hoje_no_fuso_do_negocio(self._relogio.agora())
            )
            partes = [
                (tag, parte)
                for tag, parte in dividir_por_percentuais(valor, destinacoes)
                if parte.centavos
            ]
            uow.movimentos_de_investimento.adicionar(movimento)
            uow.destinacoes.adicionar(
                movimento.id, [ParteDeDestinacao(tag, valor) for tag, valor in partes]
            )
            uow.commit()
            return MovimentoComDestinacoes(
                movimento, tuple(sorted(partes, key=lambda p: p[0].valor))
            )
