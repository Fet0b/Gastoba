import hashlib
import json
from dataclasses import asdict, dataclass
from uuid import UUID

from gastoba.domain.excecoes import MovimentoNaoDesfazivel, TransacaoImportadaNaoEncontrada
from gastoba.domain.portas import UnidadeDeTrabalho
from gastoba.domain.transacao_importada import EstadoDaTransacaoImportada


@dataclass(frozen=True, slots=True)
class ImpactoDaReversao:
    transacao_id: UUID
    versao: str
    lancamentos_removidos: int
    divisao_inteira: bool
    coberturas_removidas: int
    transacoes_reabertas: int = 1


def impacto_do_grupo(uow, usuario_id, transacao, grupo) -> ImpactoDaReversao:
    transferencia = uow.transferencias.da_transacao(usuario_id, transacao.id)
    dependencias = uow.coberturas.listar_por_resgates(usuario_id, [i.id for i in grupo])
    dados = {
        "dependencias": [asdict(c) for c in dependencias],
        "reaplicacoes": sorted(
            (
                asdict(r)
                for r in uow.reaplicacoes_de_resgates.listar(usuario_id)
                if any(i.id in (r.aporte_id, r.resgate_id) for i in grupo)
            ),
            key=lambda r: str(r["id"]),
        ),
        "transacao": asdict(transacao),
        "transferencia": asdict(transferencia) if transferencia else None,
        "grupo": sorted((asdict(item) for item in grupo), key=lambda item: str(item["id"])),
        "destinacoes": repr(
            uow.destinacoes.do_movimento([i.id for i in grupo if hasattr(i, "investimento_id")])
        ),
        "coberturas": repr(
            uow.coberturas.listar_dos_gastos(
                [
                    i.id
                    for i in grupo
                    if hasattr(i, "categoria") and not hasattr(i, "investimento_id")
                ]
            )
        ),
        "reversoes": uow.transacoes_importadas.contar_reversoes(transacao.id),
    }
    versao = hashlib.sha256(json.dumps(dados, default=str, sort_keys=True).encode()).hexdigest()
    return ImpactoDaReversao(
        transacao.id,
        versao,
        len(grupo) + (1 if transferencia else 0),
        len(grupo) > 1,
        len(dependencias),
        len(transferencia.transacao_ids) if transferencia else 1,
    )


class ConsultarImpactoDaReversao:
    def __init__(self, unidade_de_trabalho: UnidadeDeTrabalho) -> None:
        self._unidade_de_trabalho = unidade_de_trabalho

    def executar(self, usuario_id: UUID, transacao_id: UUID) -> ImpactoDaReversao:
        with self._unidade_de_trabalho as uow:
            transacao = uow.transacoes_importadas.obter(usuario_id, transacao_id)
            if transacao is None:
                raise TransacaoImportadaNaoEncontrada("Transação importada não encontrada.")
            if transacao.estado == EstadoDaTransacaoImportada.PENDENTE:
                raise MovimentoNaoDesfazivel("Esta transação já está na caixa de entrada.")
            grupo = [
                *uow.gastos.da_transacao(usuario_id, transacao.id),
                *uow.ganhos.da_transacao(usuario_id, transacao.id),
                *uow.movimentos_de_investimento.da_transacao(usuario_id, transacao.id),
            ]
            return impacto_do_grupo(uow, usuario_id, transacao, grupo)
