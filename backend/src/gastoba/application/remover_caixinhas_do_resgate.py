from uuid import UUID

from gastoba.domain.excecoes import MovimentoDeInvestimentoNaoEncontrado, MovimentoNaoDesfazivel
from gastoba.domain.movimento_de_investimento import TipoDeMovimento
from gastoba.domain.portas import UnidadeDeTrabalho


class RemoverCaixinhasDoResgate:
    """Tira as caixinhas (partes) de um resgate, que continua ligado à posição.

    O principal abatido volta às caixinhas. Recusa se o resgate paga uma compra ou tem reaplicação
    vinculada: a pessoa desfaz isso antes. Nada mais muda (saldo, posição, lançamento).
    """

    def __init__(self, unidade_de_trabalho: UnidadeDeTrabalho) -> None:
        self._unidade_de_trabalho = unidade_de_trabalho

    def executar(self, usuario_id: UUID, movimento_id: UUID) -> None:
        with self._unidade_de_trabalho as uow:
            uow.reaplicacoes_de_resgates.bloquear(usuario_id)
            movimento = uow.movimentos_de_investimento.obter(usuario_id, movimento_id)
            if movimento is None:
                raise MovimentoDeInvestimentoNaoEncontrado("Movimento não encontrado.")
            if movimento.tipo != TipoDeMovimento.RESGATE or not uow.destinacoes.do_movimento(
                [movimento.id]
            ).get(movimento.id):
                raise MovimentoNaoDesfazivel(
                    "Só um resgate com caixinhas pode ter caixinhas removidas."
                )
            if uow.reaplicacoes_de_resgates.para_movimento(usuario_id, movimento.id):
                raise MovimentoNaoDesfazivel(
                    "Desfaça primeiro a reaplicação vinculada a este resgate."
                )
            if uow.coberturas.resgate_em_uso([movimento.id]):
                raise MovimentoNaoDesfazivel(
                    "Este resgate paga uma compra: desfaça a associação da compra antes."
                )
            uow.destinacoes.remover_do_movimento(movimento.id)
            uow.commit()
