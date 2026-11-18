from uuid import UUID

from gastoba.application.tratamento_de_aporte_comum import (
    exigir_aporte_sem_investimento,
    valores_originais,
)
from gastoba.domain.excecoes import (
    AporteJaTratado,
    MesclaInvalida,
    MovimentoDeInvestimentoNaoEncontrado,
)
from gastoba.domain.portas import Relogio, UnidadeDeTrabalho
from gastoba.domain.tratamento_de_aporte import AcaoDoTratamento, TratamentoDeAporte


class MesclarAporteSemInvestimento:
    """Mescla um aporte com o duplicado que fica (mesma conta, dia e valor). É **lógico**: o
    registro não é apagado e só sai dos totais depois da aprovação (RF-023); desfazível."""

    def __init__(self, unidade_de_trabalho: UnidadeDeTrabalho, relogio: Relogio) -> None:
        self._unidade_de_trabalho = unidade_de_trabalho
        self._relogio = relogio

    def executar(
        self, usuario_id: UUID, movimento_id: UUID, mantido_id: UUID
    ) -> TratamentoDeAporte:
        if movimento_id == mantido_id:
            raise MesclaInvalida("Escolha outro aporte para mesclar.")
        with self._unidade_de_trabalho as uow:
            movimento = uow.movimentos_de_investimento.obter(usuario_id, movimento_id)
            mantido = uow.movimentos_de_investimento.obter(usuario_id, mantido_id)
            if movimento is None or mantido is None:
                raise MovimentoDeInvestimentoNaoEncontrado("Movimento não encontrado.")
            if uow.tratamentos.ativo_do_movimento(usuario_id, movimento.id) is not None:
                raise AporteJaTratado("Este aporte já foi tratado.")
            exigir_aporte_sem_investimento(movimento)
            if (movimento.conta_id, movimento.data, movimento.valor) != (
                mantido.conta_id,
                mantido.data,
                mantido.valor,
            ):
                raise MesclaInvalida("Só se mescla aporte da mesma conta, dia e valor.")
            if uow.tratamentos.ativo_do_movimento(usuario_id, mantido.id) is not None or any(
                t.mesclado_em_id == movimento.id and t.ativo
                for t in uow.tratamentos.listar(usuario_id)
            ):
                raise MesclaInvalida("O aporte que fica não pode estar em outra mescla.")
            tratamento = TratamentoDeAporte(
                movimento_id=movimento.id,
                acao=AcaoDoTratamento.MESCLADO,
                valores_originais=valores_originais(movimento),
                criado_em=self._relogio.agora(),
                mesclado_em_id=mantido.id,
            )
            uow.tratamentos.adicionar(usuario_id, tratamento)
            uow.commit()
            return tratamento
