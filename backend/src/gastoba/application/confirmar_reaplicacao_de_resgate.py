from uuid import UUID

from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.excecoes import MovimentoDeInvestimentoNaoEncontrado, ReaplicacaoJaExiste
from gastoba.domain.portas import UnidadeDeTrabalho
from gastoba.domain.reaplicacao_de_resgate import ReaplicacaoDeResgate, validar_reaplicacao


class ConfirmarReaplicacaoDeResgate:
    def __init__(self, unidade_de_trabalho: UnidadeDeTrabalho) -> None:
        self._unidade_de_trabalho = unidade_de_trabalho

    def executar(
        self, usuario_id: UUID, aporte_id: UUID, resgate_id: UUID, valor: Dinheiro
    ) -> ReaplicacaoDeResgate:
        with self._unidade_de_trabalho as uow:
            repo = uow.reaplicacoes_de_resgates
            repo.bloquear(usuario_id)
            aporte = uow.movimentos_de_investimento.obter(usuario_id, aporte_id)
            resgate = uow.movimentos_de_investimento.obter(usuario_id, resgate_id)
            if aporte is None or resgate is None:
                raise MovimentoDeInvestimentoNaoEncontrado("Movimento não encontrado.")
            if repo.para_movimento(usuario_id, aporte.id) or repo.para_movimento(
                usuario_id, resgate.id
            ):
                raise ReaplicacaoJaExiste(
                    "Um destes movimentos já tem reaplicação. Desfaça o vínculo antes de alterar."
                )
            origem = (
                uow.investimentos.obter(usuario_id, resgate.investimento_id)
                if resgate.investimento_id
                else None
            )
            destino = (
                uow.investimentos.obter(usuario_id, aporte.investimento_id)
                if aporte.investimento_id
                else None
            )
            usados = uow.coberturas.usado_dos_resgates([resgate.id]).get(resgate.id, {})
            validar_reaplicacao(
                resgate,
                aporte,
                origem,
                destino,
                valor,
                Dinheiro(sum(v.centavos for v in usados.values())),
            )
            reaplicacao = ReaplicacaoDeResgate(resgate.id, aporte.id, valor)
            repo.adicionar(reaplicacao)
            uow.commit()
            return reaplicacao
