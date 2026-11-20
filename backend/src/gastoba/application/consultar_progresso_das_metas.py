from uuid import UUID

from gastoba.application.listar_investimentos import (
    posicoes_do_usuario,
    principal_e_rendimento_por_tag,
)
from gastoba.domain.caixinha_marcada import GuardadoDaCategoria, guardado_por_categoria
from gastoba.domain.categoria import CategoriaDoGasto
from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.investimento import rentabilidade_em_percentual
from gastoba.domain.mes import Mes
from gastoba.domain.meta import AlvoDaMeta, CaixinhaDaMeta, ProgressoDaMeta, ResumoDasMetas
from gastoba.domain.movimento_de_investimento import MovimentoDeInvestimento
from gastoba.domain.portas import UnidadeDeTrabalho
from gastoba.domain.tag import Tag


class ConsultarProgressoDasMetas:
    def __init__(self, unidade_de_trabalho: UnidadeDeTrabalho) -> None:
        self._unidade_de_trabalho = unidade_de_trabalho

    def executar(self, usuario_id: UUID, mes: Mes) -> ResumoDasMetas:
        """A renda registrada e o progresso das metas, pela base quando configurada.

        O mês é do calendário, medido pela ``data`` dos ganhos e dos gastos, em todas as contas.
        A meta financeira soma aportes elegíveis e gastos legados de investimentos.
        Resgates, rendimentos e custos não alteram esse gasto.
        """
        with self._unidade_de_trabalho as uow:
            renda = uow.ganhos.somar(usuario_id, mes.inicio, mes.fim)
            renda_base = uow.renda_base.obter(usuario_id)
            resumo = ResumoDasMetas(renda=renda, progressos=(), renda_base=renda_base)
            gastos = uow.gastos.somar_por_categoria(usuario_id, mes.inicio, mes.fim)
            aportes = uow.movimentos_de_investimento.somar_aportes(usuario_id, mes.inicio, mes.fim)
            aportes -= uow.reaplicacoes_de_resgates.somar_no_periodo(
                usuario_id, mes.inicio, mes.fim
            )
            adicionais = uow.coberturas.somar_adicional_por_categoria(
                usuario_id, mes.inicio, mes.fim
            )
            rendimentos = principal_e_rendimento_por_tag(posicoes_do_usuario(uow, usuario_id))
            por_alvo = {
                AlvoDaMeta.LIBERDADE_FINANCEIRA: aportes
                + gastos.get(CategoriaDoGasto.INVESTIMENTOS, Dinheiro(0))
            }
            for categoria in CategoriaDoGasto.ativas():
                por_alvo[AlvoDaMeta(categoria.value)] = gastos.get(categoria, Dinheiro(0))
            movimentos = uow.movimentos_de_investimento.listar(usuario_id, mes.inicio, mes.fim)
            guardados = self._guardado_do_mes(uow, usuario_id, movimentos)
            progressos = tuple(
                _progresso(
                    meta.alvo,
                    meta.percentual,
                    resumo.renda_de_referencia,
                    por_alvo.get(meta.alvo, Dinheiro(0)),
                    adicionais,
                    rendimentos,
                    guardados.get(CategoriaDoGasto(meta.alvo.value))
                    if meta.alvo is not AlvoDaMeta.LIBERDADE_FINANCEIRA
                    else None,
                )
                for meta in uow.metas.listar(usuario_id)
            )
            pendentes = sum(m.revisao_contabil_pendente for m in movimentos)
            return ResumoDasMetas(
                renda=renda,
                progressos=progressos,
                renda_base=renda_base,
                classificacoes_para_revisar=pendentes,
                aportes_do_mes=aportes,
            )

    @staticmethod
    def _guardado_do_mes(
        uow: UnidadeDeTrabalho, usuario_id: UUID, movimentos: list[MovimentoDeInvestimento]
    ) -> dict[CategoriaDoGasto, GuardadoDaCategoria]:
        """Só exibição (066): sem a opção ligada, nenhuma leitura a mais e nada de guardado."""
        configuracao = uow.guardado_nas_metas.obter(usuario_id)
        if not configuracao.ativo or not configuracao.marcacoes:
            return {}
        partes = uow.destinacoes.do_movimento([m.id for m in movimentos])
        return guardado_por_categoria(
            ((m, partes.get(m.id, [])) for m in movimentos), configuracao.marcacoes
        )


def _progresso(
    alvo: AlvoDaMeta,
    percentual: int,
    renda: Dinheiro,
    gasto: Dinheiro,
    adicionais: dict[CategoriaDoGasto, dict[Tag, Dinheiro]],
    rendimentos: dict[Tag, tuple[Dinheiro, Dinheiro]],
    guardado: GuardadoDaCategoria | None = None,
) -> ProgressoDaMeta:
    if alvo is AlvoDaMeta.LIBERDADE_FINANCEIRA:
        tags = sorted(rendimentos, key=lambda t: t.valor)
        usados: dict[Tag, Dinheiro] = {}
    else:
        categoria = CategoriaDoGasto(alvo.value)
        usados = adicionais.get(categoria, {})
        tags = sorted(usados, key=lambda t: t.valor)
    principal_total = Dinheiro(0)
    rendimento_total = Dinheiro(0)
    caixinhas = []
    for tag in tags:
        principal, rendimento = rendimentos.get(tag, (Dinheiro(0), Dinheiro(0)))
        principal_total += principal
        rendimento_total += rendimento
        caixinhas.append(
            CaixinhaDaMeta(
                tag,
                usados.get(tag, Dinheiro(0)),
                rentabilidade_em_percentual(rendimento, principal),
            )
        )
    return ProgressoDaMeta(
        alvo=alvo,
        percentual=percentual,
        renda=renda,
        gasto=gasto,
        adicional=Dinheiro(sum(v.centavos for v in usados.values())),
        caixinhas=tuple(caixinhas),
        rentabilidade=rentabilidade_em_percentual(rendimento_total, principal_total),
        guardado=guardado.valor if guardado else Dinheiro(0),
        caixinhas_guardadas=guardado.tags if guardado else (),
    )
