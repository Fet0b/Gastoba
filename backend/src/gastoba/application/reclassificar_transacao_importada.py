from collections.abc import Sequence
from uuid import UUID

from gastoba.application.aceitar_transacao_importada import aceitar_sem_confirmar
from gastoba.application.desfazer_classificacao_importada import desfazer_sem_confirmar
from gastoba.domain.categoria import CategoriaDoGasto
from gastoba.domain.destinacao import Destinacao
from gastoba.domain.excecoes import TransacaoImportadaInvalida
from gastoba.domain.movimento_de_investimento import TipoDeMovimento
from gastoba.domain.portas import UnidadeDeTrabalho

ROTULOS = (
    "gasto",
    "ganho",
    "transferencia_para_investimento",
    "imposto",
    "custo",
    "rendimento_da_posicao",
)
_TIPO_DO_MOVIMENTO = {
    "imposto": TipoDeMovimento.IMPOSTO,
    "custo": TipoDeMovimento.CUSTO,
    "rendimento_da_posicao": TipoDeMovimento.RENDIMENTO,
}
_EXIGEM_INVESTIMENTO = ("imposto", "custo", "rendimento_da_posicao")


class ReclassificarTransacaoImportada:
    """Troca a classificação de uma transação já aceita numa **só transação**: desfaz a atual (com
    a mesma prévia, versão e regras de segurança do desfazer) e aplica a nova. Se a nova falhar,
    a antiga continua intacta. Nada é apagado à mão nem relançado, e a mudança é desfazível."""

    def __init__(self, unidade_de_trabalho: UnidadeDeTrabalho) -> None:
        self._unidade_de_trabalho = unidade_de_trabalho

    def executar(
        self,
        usuario_id: UUID,
        transacao_id: UUID,
        rotulo: str,
        *,
        versao_esperada: str,
        categoria: CategoriaDoGasto | None = None,
        tags: Sequence[str] = (),
        investimento_id: UUID | None = None,
        destinacoes: Sequence[Destinacao] = (),
        movimento_relacionado_id: UUID | None = None,
        desfazer_divisao_inteira: bool = False,
        desfazer_dependencias: bool = False,
    ):
        if rotulo not in ROTULOS:
            raise TransacaoImportadaInvalida("Escolha um rótulo válido para a transação.")
        if rotulo in _EXIGEM_INVESTIMENTO and investimento_id is None:
            raise TransacaoImportadaInvalida("Escolha o investimento desta operação.")
        with self._unidade_de_trabalho as uow:
            desfazer_sem_confirmar(
                uow,
                usuario_id,
                transacao_id,
                desfazer_divisao_inteira=desfazer_divisao_inteira,
                desfazer_dependencias=desfazer_dependencias,
                versao_esperada=versao_esperada,
                confirmar=False,
            )
            como_movimento = rotulo in ("transferencia_para_investimento", *_TIPO_DO_MOVIMENTO)
            lancamento = aceitar_sem_confirmar(
                uow,
                usuario_id,
                transacao_id,
                categoria if rotulo == "gasto" else None,
                tags if rotulo in ("gasto", "ganho") else (),
                como_investimento=como_movimento,
                investimento_id=investimento_id if como_movimento else None,
                destinacoes=destinacoes if rotulo == "transferencia_para_investimento" else (),
                tipo_de_movimento=_TIPO_DO_MOVIMENTO.get(rotulo),
                movimento_relacionado_id=movimento_relacionado_id,
            )
            uow.commit()
            return lancamento
