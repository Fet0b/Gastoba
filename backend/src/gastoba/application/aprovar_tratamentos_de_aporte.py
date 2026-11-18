from collections.abc import Sequence
from uuid import UUID

from gastoba.domain.portas import Relogio, UnidadeDeTrabalho
from gastoba.domain.transacao_importada import EstadoDaTransacaoImportada


class AprovarTratamentosDeAporte:
    """O dono aprova (por escrito, depois de ver o relatório) os tratamentos registrados: a partir
    daí o aporte sai das listas e dos totais, inclusive de meses passados. Se o aporte veio da
    caixa importada, a transação volta a pendente; sem origem, nada é reaberto."""

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
                tratamento.aprovado_em = self._relogio.agora()
                uow.tratamentos.atualizar(usuario_id, tratamento)
                origem = tratamento.valores_originais.get("transacao_importada_id")
                if origem:
                    transacao = uow.transacoes_importadas.obter(usuario_id, UUID(origem))
                    if (
                        transacao is not None
                        and transacao.estado == EstadoDaTransacaoImportada.ACEITA
                    ):
                        transacao.reabrir()
                        uow.transacoes_importadas.atualizar_estado(transacao)
                aprovados += 1
            uow.commit()
        return aprovados
