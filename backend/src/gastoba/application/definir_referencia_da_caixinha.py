from uuid import UUID

from gastoba.domain.caixinha import TIPO_DA_CAIXINHA, ReferenciaMensalDaCaixinha
from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.excecoes import InvestimentoNaoEncontrado, TransacaoImportadaInvalida
from gastoba.domain.mes import Mes
from gastoba.domain.portas import UnidadeDeTrabalho


class DefinirReferenciaDaCaixinha:
    def __init__(self, unidade_de_trabalho: UnidadeDeTrabalho) -> None:
        self._unidade_de_trabalho = unidade_de_trabalho

    def executar(
        self,
        usuario_id: UUID,
        investimento_id: UUID,
        mes: Mes,
        saldo_inicial: Dinheiro,
        saldo_final: Dinheiro,
        periodo_completo: bool,
    ) -> ReferenciaMensalDaCaixinha:
        with self._unidade_de_trabalho as uow:
            inv = uow.investimentos.obter(usuario_id, investimento_id)
            if inv is None:
                raise InvestimentoNaoEncontrado("Investimento não encontrado.")
            if inv.tipo != TIPO_DA_CAIXINHA:
                raise TransacaoImportadaInvalida("A referência mensal é da conta investimentos.")
            referencia = ReferenciaMensalDaCaixinha(
                investimento_id, mes, saldo_inicial, saldo_final, periodo_completo
            )
            uow.investimentos.definir_referencia_da_caixinha(referencia)
            uow.commit()
            return referencia
