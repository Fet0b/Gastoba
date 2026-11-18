from dataclasses import dataclass
from datetime import date
from uuid import UUID

from gastoba.application.listar_investimentos import posicoes_do_usuario
from gastoba.domain.alocacao_de_caixinha import AlocacaoDeCaixinha
from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.excecoes import MigracaoInconsistente
from gastoba.domain.movimento_de_investimento import OrigemDoMovimento
from gastoba.domain.operacao import Operacao, OrigemDaOperacao, TipoDeOperacao
from gastoba.domain.pesos_da_caixinha import pesos_da_caixinha, ratear_pelos_pesos
from gastoba.domain.portas import UnidadeDeTrabalho
from gastoba.domain.quantidade_observada import quantidade_observada_da_posicao

TIPO_FORA_DA_MIGRACAO = "CAIXINHA"


@dataclass(frozen=True, slots=True)
class RelatorioDaAplicacao:
    posicoes: int
    aberturas_criadas: int
    alocacoes_gravadas: int
    aplicado: bool


class MigrarInvestimentos:
    """Backfill idempotente para o modelo novo: posições, aberturas estimadas e alocações.

    Só escreve nas tabelas novas. Nada antigo é alterado ou apagado, e a conta remunerada
    ``CAIXINHA`` fica fora (D6). Antes de confirmar, confere que as caixinhas não mudaram nem um
    centavo e que contas e movimentos continuam iguais; se algo diverge, nada é gravado.
    """

    def __init__(self, unidade_de_trabalho: UnidadeDeTrabalho) -> None:
        self._unidade_de_trabalho = unidade_de_trabalho

    def executar(self, usuario_id: UUID, *, aplicar: bool) -> RelatorioDaAplicacao:
        with self._unidade_de_trabalho as uow:
            saldos = sum(c.saldo.centavos for c in uow.contas.listar(usuario_id))
            movimentos = len(uow.movimentos_de_investimento.listar(usuario_id, date.min, date.max))
            antes = {
                p.investimento.id: {d.tag: d.valor_atual for d in p.destinacoes}
                for p in posicoes_do_usuario(uow, usuario_id)
            }
            externos = {e.id_externo: e for e in uow.investimentos.listar(usuario_id)}
            principais = uow.destinacoes.principais(usuario_id)
            todos = uow.movimentos_de_investimento.listar(usuario_id, date.min, date.max)
            ids_das_tags = uow.alocacoes.ids_das_tags(usuario_id)
            posicoes = aberturas = alocacoes = 0
            if aplicar:
                for investimento in uow.investimentos.listar_posicoes(usuario_id):
                    if investimento.tipo == TIPO_FORA_DA_MIGRACAO:
                        continue
                    externo = externos.get(investimento.id_externo)
                    observada = quantidade_observada_da_posicao(
                        investimento.tipo, investimento.saldo, externo.dados if externo else "{}"
                    )
                    uow.operacoes.definir_observacao(
                        usuario_id, investimento.id, observada, investimento.saldo, None
                    )
                    posicoes += 1
                    iniciais = [
                        m
                        for m in todos
                        if m.investimento_id == investimento.id
                        and m.origem == OrigemDoMovimento.SALDO_INICIAL
                    ]
                    if (
                        iniciais
                        and observada is not None
                        and observada > 0
                        and not uow.operacoes.listar_da_posicao(usuario_id, investimento.id)
                    ):
                        uow.operacoes.adicionar(
                            usuario_id,
                            Operacao(
                                posicao_id=investimento.id,
                                tipo=TipoDeOperacao.ABERTURA,
                                data=min(m.data for m in iniciais),
                                quantidade=observada,
                                valor_bruto=Dinheiro(sum(m.valor.centavos for m in iniciais)),
                                origem=OrigemDaOperacao.ABERTURA,
                                quantidade_estimada=True,
                            ),
                        )
                        aberturas += 1
                    pesos = pesos_da_caixinha(principais.get(investimento.id, {}))
                    ja = uow.alocacoes.listar_da_posicao(usuario_id, investimento.id)
                    if pesos and not ja and all(t in ids_das_tags for t in pesos):
                        uow.alocacoes.substituir(
                            usuario_id,
                            investimento.id,
                            [
                                AlocacaoDeCaixinha(investimento.id, ids_das_tags[t], p)
                                for t, p in pesos.items()
                            ],
                        )
                        alocacoes += len(pesos)
                if alocacoes or aberturas:
                    # Nada estrutural mudou (execução repetida): não há o que conferir.
                    self._conferir(uow, usuario_id, antes, saldos, movimentos)
                uow.commit()
        return RelatorioDaAplicacao(posicoes, aberturas, alocacoes, aplicar)

    @staticmethod
    def _conferir(uow, usuario_id, antes, saldos, movimentos) -> None:
        if saldos != sum(c.saldo.centavos for c in uow.contas.listar(usuario_id)):
            raise MigracaoInconsistente("O saldo das contas mudou; nada foi gravado.")
        if movimentos != len(uow.movimentos_de_investimento.listar(usuario_id, date.min, date.max)):
            raise MigracaoInconsistente("A contagem de movimentos mudou; nada foi gravado.")
        tags = {v: k for k, v in uow.alocacoes.ids_das_tags(usuario_id).items()}
        for investimento in uow.investimentos.listar_posicoes(usuario_id):
            alocadas = uow.alocacoes.listar_da_posicao(usuario_id, investimento.id)
            if not alocadas:
                continue
            pesos = {tags[a.destinacao_id]: a.peso_centavos for a in alocadas}
            depois = {t: v for t, v in ratear_pelos_pesos(investimento.saldo, pesos, Dinheiro(0))}
            # Posição encerrada (saldo zero) não está em `antes`: só valor diferente de zero conta.
            if _com_valor(depois) != _com_valor(antes.get(investimento.id, {})):
                raise MigracaoInconsistente(
                    "Uma caixinha mudou de valor na simulação; nada foi gravado."
                )
        for posicao in posicoes_do_usuario(uow, usuario_id):
            if posicao.investimento.saldo.centavos <= 0:
                continue
            for destinacao in posicao.destinacoes:
                if (
                    destinacao.tag is not None
                    and destinacao.principal.centavos > 0
                    and destinacao.valor_atual.centavos == 0
                ):
                    raise MigracaoInconsistente(
                        "Uma caixinha com principal ficaria sem valor na tela; nada foi gravado."
                    )


def _com_valor(partes: dict) -> dict:
    return {tag: valor for tag, valor in partes.items() if valor.centavos != 0}
