from collections.abc import Sequence
from datetime import datetime
from uuid import UUID

from gastoba.domain.excecoes import AporteJaTratado, TratamentoNaoEncontrado
from gastoba.domain.portas import Relogio, UnidadeDeTrabalho
from gastoba.domain.transacao_importada import EstadoDaTransacaoImportada
from gastoba.domain.tratamento_de_aporte import TratamentoDeAporte


def aprovar_sem_confirmar(
    uow: UnidadeDeTrabalho, usuario_id: UUID, tratamento: TratamentoDeAporte, agora: datetime
) -> None:
    """Aprova o tratamento na unidade de trabalho de quem chama, sem ``commit``."""
    tratamento.aprovado_em = agora
    uow.tratamentos.atualizar(usuario_id, tratamento)
    origem = tratamento.valores_originais.get("transacao_importada_id")
    if origem:
        transacao = uow.transacoes_importadas.obter(usuario_id, UUID(origem))
        if transacao is not None and transacao.estado == EstadoDaTransacaoImportada.ACEITA:
            transacao.devolver_a_caixa()
            uow.transacoes_importadas.atualizar_estado(transacao)


class AprovarTratamentosDeAporte:
    """A pessoa aprova (na tela ou, em lote, pelo comando administrativo) os tratamentos
    registrados: a partir daí o aporte sai das listas e dos totais, inclusive de meses passados.
    Se o aporte veio da caixa importada, a transação volta a pendente; o movimento interno da
    conta investimentos (aplicação e resgate automáticos) volta ignorado, nunca à caixa. Sem
    origem, nada é reaberto."""

    def __init__(self, unidade_de_trabalho: UnidadeDeTrabalho, relogio: Relogio) -> None:
        self._unidade_de_trabalho = unidade_de_trabalho
        self._relogio = relogio

    def executar(self, usuario_id: UUID, tratamento_ids: Sequence[UUID] | None = None) -> int:
        aprovados = 0
        with self._unidade_de_trabalho as uow:
            for tratamento in uow.tratamentos.listar(usuario_id):
                if not tratamento.ativo or tratamento.aprovado_em is not None:
                    continue
                if tratamento_ids is not None and tratamento.id not in tratamento_ids:
                    continue
                aprovar_sem_confirmar(uow, usuario_id, tratamento, self._relogio.agora())
                aprovados += 1
            uow.commit()
        return aprovados

    def confirmar_do_aporte(self, usuario_id: UUID, movimento_id: UUID) -> TratamentoDeAporte:
        """Confirma o tratamento ativo de um aporte, achado pelo movimento."""
        with self._unidade_de_trabalho as uow:
            tratamento = uow.tratamentos.ativo_do_movimento(usuario_id, movimento_id)
            if tratamento is None:
                raise TratamentoNaoEncontrado("Este aporte não tem tratamento para confirmar.")
            if tratamento.aprovado_em is not None:
                raise AporteJaTratado("O tratamento deste aporte já foi confirmado.")
            aprovar_sem_confirmar(uow, usuario_id, tratamento, self._relogio.agora())
            uow.commit()
            return tratamento
