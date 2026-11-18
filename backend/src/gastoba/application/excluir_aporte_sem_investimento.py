from uuid import UUID

from gastoba.application.tratamento_de_aporte_comum import (
    exigir_aporte_sem_investimento,
    valores_originais,
)
from gastoba.domain.excecoes import AporteJaTratado, MovimentoDeInvestimentoNaoEncontrado
from gastoba.domain.portas import Relogio, UnidadeDeTrabalho
from gastoba.domain.tratamento_de_aporte import AcaoDoTratamento, TratamentoDeAporte


class ExcluirAporteSemInvestimento:
    """Exclusão **lógica**: nada é apagado do banco; o aporte guarda o valor original, só sai dos
    totais depois da aprovação (RF-023) e a pessoa pode desfazer."""

    def __init__(self, unidade_de_trabalho: UnidadeDeTrabalho, relogio: Relogio) -> None:
        self._unidade_de_trabalho = unidade_de_trabalho
        self._relogio = relogio

    def executar(self, usuario_id: UUID, movimento_id: UUID) -> TratamentoDeAporte:
        with self._unidade_de_trabalho as uow:
            movimento = uow.movimentos_de_investimento.obter(usuario_id, movimento_id)
            if movimento is None:
                raise MovimentoDeInvestimentoNaoEncontrado("Movimento não encontrado.")
            if uow.tratamentos.ativo_do_movimento(usuario_id, movimento.id) is not None:
                raise AporteJaTratado("Este aporte já foi tratado.")
            exigir_aporte_sem_investimento(movimento)
            tratamento = TratamentoDeAporte(
                movimento_id=movimento.id,
                acao=AcaoDoTratamento.EXCLUIDO,
                valores_originais=valores_originais(movimento),
                criado_em=self._relogio.agora(),
            )
            uow.tratamentos.adicionar(usuario_id, tratamento)
            uow.commit()
            return tratamento
