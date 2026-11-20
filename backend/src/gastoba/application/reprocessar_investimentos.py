from dataclasses import dataclass, field
from datetime import date
from uuid import UUID

from gastoba.application.destinar_movimento import abater_saldos_iniciais, preparar_destinacoes
from gastoba.domain.caixinha import reconciliar_caixinha
from gastoba.domain.destinacao import destinacoes_proporcionais
from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.excecoes import ErroDeDominio
from gastoba.domain.investimento import Investimento
from gastoba.domain.movimento_de_investimento import (
    OrigemDoMovimento,
    TipoDeMovimento,
)
from gastoba.domain.natureza_do_movimento import (
    TIPO_DA_CAIXINHA,
    NaturezaDoMovimento,
    natureza_da_descricao,
)
from gastoba.domain.portas import UnidadeDeTrabalho
from gastoba.domain.sugestao_de_investimento import investimento_do_vencimento
from gastoba.domain.texto import normalizar_texto
from gastoba.domain.transacao_importada import EstadoDaTransacaoImportada

_PRIMEIRO_DIA = date.min
_ULTIMO_DIA = date.max
# Quantos dias em volta do vencimento se procura o que explica a diferença do valor resgatado.
JANELA_DO_VENCIMENTO_EM_DIAS = 5


@dataclass(frozen=True, slots=True)
class Achado:
    """Uma linha do relatório. ``tipo`` é estável (testes e leitura por script); ``texto`` é para
    a pessoa. Valores e descrições só aparecem aqui, no terminal de quem roda; nada vai ao log."""

    tipo: str
    texto: str


@dataclass(slots=True)
class RelatorioDoReprocessamento:
    # O que foi corrigido (ou o que seria, no dry-run).
    corrigidos: list[Achado] = field(default_factory=list)
    # O que ficou ambíguo ou depende de decisão: nunca é alterado por este caso de uso.
    para_revisar: list[Achado] = field(default_factory=list)


def _reais(valor: Dinheiro) -> str:
    centavos = abs(valor.centavos)
    return f"R$ {centavos // 100}.{centavos % 100:02d}"


class ReprocessarInvestimentos:
    """Reprocessa os dados de investimento já gravados com as regras corrigidas.

    Só corrige o que é inequívoco e idempotente: vincula o resgate de vencimento à posição única
    que casa e abate do saldo inicial o que o principal tem a mais do que a posição justifica. O
    resto (conta remunerada ligada a ação, imposto ou taxa lançado como aporte, liquidações de
    bolsa, diferenças de valor) é listado em ``para_revisar`` e não é tocado.

    Com ``aplicar=False`` (dry-run) roda a mesma lógica e descarta a transação no fim.
    """

    def __init__(self, unidade_de_trabalho: UnidadeDeTrabalho) -> None:
        self._unidade_de_trabalho = unidade_de_trabalho

    def executar(self, usuario_id: UUID, *, aplicar: bool) -> RelatorioDoReprocessamento:
        relatorio = RelatorioDoReprocessamento()
        with self._unidade_de_trabalho as uow:
            self._vincular_vencimentos(uow, usuario_id, relatorio)
            self._abater_saldos_iniciais_em_excesso(uow, usuario_id, relatorio)
            self._listar_para_revisao(uow, usuario_id, relatorio)
            if aplicar:
                uow.commit()
        return relatorio

    @staticmethod
    def _vincular_vencimentos(
        uow: UnidadeDeTrabalho, usuario_id: UUID, relatorio: RelatorioDoReprocessamento
    ) -> None:
        posicoes = uow.investimentos.listar_posicoes(usuario_id)
        for resgate in uow.movimentos_de_investimento.listar_resgates_sem_destinacao(usuario_id):
            if natureza_da_descricao(resgate.descricao) != NaturezaDoMovimento.VENCIMENTO:
                continue
            investimento_id = investimento_do_vencimento(resgate.descricao, posicoes)
            if investimento_id is None:
                relatorio.para_revisar.append(
                    Achado(
                        "vencimento_sem_posicao_unica",
                        f"{resgate.data} {_reais(resgate.valor)} «{resgate.descricao}»: nenhuma "
                        "posição (ou mais de uma) casa com o emissor e a data do vencimento.",
                    )
                )
                continue
            principais = uow.destinacoes.principais(usuario_id).get(investimento_id, {})
            destinacoes = destinacoes_proporcionais(principais)
            if not destinacoes:
                relatorio.para_revisar.append(
                    Achado(
                        "vencimento_sem_principal",
                        f"{resgate.data} {_reais(resgate.valor)} «{resgate.descricao}»: a posição "
                        "não tem principal registrado para o resgate herdar.",
                    )
                )
                continue
            try:
                partes = preparar_destinacoes(
                    uow, usuario_id, resgate, investimento_id, destinacoes
                )
            except ErroDeDominio as erro:
                relatorio.para_revisar.append(
                    Achado(
                        "vencimento_recusado",
                        f"{resgate.data} {_reais(resgate.valor)} «{resgate.descricao}»: {erro}",
                    )
                )
                continue
            uow.movimentos_de_investimento.associar(resgate.id, investimento_id)
            uow.destinacoes.adicionar(resgate.id, partes)
            relatorio.corrigidos.append(
                Achado(
                    "vencimento_vinculado",
                    f"{resgate.data} {_reais(resgate.valor)} «{resgate.descricao}» vinculado à "
                    "posição e dividido como o principal dela.",
                )
            )

    @staticmethod
    def _abater_saldos_iniciais_em_excesso(
        uow: UnidadeDeTrabalho, usuario_id: UUID, relatorio: RelatorioDoReprocessamento
    ) -> None:
        """O principal não pode passar do valor aplicado que a instituição informa; o excesso
        vem de uma compra contada junto com o saldo inicial, e sai dele. Idempotente."""
        for investimento in uow.investimentos.listar_posicoes(usuario_id):
            if investimento.encerrado or investimento.valor_aplicado is None:
                continue
            principal = sum(
                p.centavos
                for p in uow.destinacoes.principais(usuario_id).get(investimento.id, {}).values()
            )
            excesso = principal - investimento.valor_aplicado.centavos
            if excesso <= 0:
                continue
            tirado = abater_saldos_iniciais(uow, usuario_id, investimento.id, Dinheiro(excesso))
            if tirado.centavos > 0:
                relatorio.corrigidos.append(
                    Achado(
                        "saldo_inicial_duplicado",
                        f"«{investimento.nome}»: o principal passava do aplicado em "
                        f"{_reais(Dinheiro(excesso))}; {_reais(tirado)} saíram do saldo inicial.",
                    )
                )
            if tirado.centavos < excesso:
                relatorio.para_revisar.append(
                    Achado(
                        "principal_acima_do_aplicado",
                        f"«{investimento.nome}»: o principal passa do aplicado em "
                        f"{_reais(Dinheiro(excesso - tirado.centavos))} e não há saldo inicial "
                        "para abater.",
                    )
                )

    @staticmethod
    def _listar_para_revisao(
        uow: UnidadeDeTrabalho, usuario_id: UUID, relatorio: RelatorioDoReprocessamento
    ) -> None:
        posicoes = {p.id: p for p in uow.investimentos.listar_posicoes(usuario_id)}
        movimentos = uow.movimentos_de_investimento.listar(usuario_id, _PRIMEIRO_DIA, _ULTIMO_DIA)
        for movimento in movimentos:
            if movimento.origem != OrigemDoMovimento.OPEN_FINANCE:
                continue
            natureza = natureza_da_descricao(movimento.descricao)
            linha = f"{movimento.data} {_reais(movimento.valor)} «{movimento.descricao}»"
            alvo_da_ligacao = posicoes.get(movimento.investimento_id or movimento.id)
            if (
                natureza == NaturezaDoMovimento.CONTA_REMUNERADA
                and alvo_da_ligacao is not None
                and alvo_da_ligacao.tipo != TIPO_DA_CAIXINHA
            ):
                alvo = alvo_da_ligacao
                relatorio.para_revisar.append(
                    Achado(
                        "conta_remunerada_em_investimento",
                        f"{linha} está ligado a «{alvo.nome if alvo else '?'}»; o dinheiro da "
                        "conta investimentos fica no saldo da conta e pertence à caixinha dela.",
                    )
                )
            elif (
                natureza == NaturezaDoMovimento.IMPOSTO_OU_TAXA
                and movimento.tipo == TipoDeMovimento.APORTE
                and movimento.investimento_id is None
            ):
                relatorio.para_revisar.append(
                    Achado(
                        "imposto_ou_taxa_como_aporte",
                        f"{linha} é imposto ou taxa registrado como aporte sem posição: ligue-o "
                        "à posição de que compõe o custo ou reclassifique.",
                    )
                )
            elif natureza == NaturezaDoMovimento.LIQUIDACAO_DE_BOLSA:
                alvo = (
                    posicoes.get(movimento.investimento_id) if movimento.investimento_id else None
                )
                relatorio.para_revisar.append(
                    Achado(
                        "liquidacao_de_bolsa",
                        f"{linha} registrado como {movimento.tipo.value}"
                        + (f", ligado a «{alvo.nome}»." if alvo else ", sem posição ligada.")
                        + " Confira o sentido (compra é aporte, venda é resgate).",
                    )
                )
        for posicao in posicoes.values():
            if posicao.tipo == TIPO_DA_CAIXINHA and not posicao.encerrado:
                ReprocessarInvestimentos._conferir_caixinha(uow, usuario_id, posicao, relatorio)
            if posicao.encerrado:
                ReprocessarInvestimentos._explicar_encerrado(uow, usuario_id, posicao, relatorio)

    @staticmethod
    def _conferir_caixinha(
        uow: UnidadeDeTrabalho,
        usuario_id: UUID,
        posicao: Investimento,
        relatorio: RelatorioDoReprocessamento,
    ) -> None:
        """O principal da caixinha não pode passar do saldo do banco: se passa, falta classificar
        resgate automático (ou o rendimento foi reaplicado e entrou como aporte)."""
        principal = Dinheiro(
            sum(
                p.centavos
                for p in uow.destinacoes.principais(usuario_id).get(posicao.id, {}).values()
            )
        )
        reconciliacao = reconciliar_caixinha(posicao.saldo, principal)
        if reconciliacao.divergente:
            relatorio.para_revisar.append(
                Achado(
                    "caixinha_divergente",
                    f"«{posicao.nome}»: saldo {_reais(posicao.saldo)}, principal "
                    f"{_reais(principal)}. O principal passa do saldo em "
                    f"{_reais(reconciliacao.rendimento)}: há resgate automático sem classificar.",
                )
            )

    @staticmethod
    def _explicar_encerrado(
        uow: UnidadeDeTrabalho,
        usuario_id: UUID,
        posicao: Investimento,
        relatorio: RelatorioDoReprocessamento,
    ) -> None:
        """Para a posição encerrada com principal registrado, lista as transações do emissor
        perto do vencimento: onde costuma estar o rendimento que não chegou ao resgate."""
        principal = sum(
            p.centavos for p in uow.destinacoes.principais(usuario_id).get(posicao.id, {}).values()
        )
        if principal <= 0 or posicao.vencimento is None or not posicao.emissor:
            return
        emissor = f" {normalizar_texto(posicao.emissor)} "
        for estado in EstadoDaTransacaoImportada:
            for transacao in uow.transacoes_importadas.listar(usuario_id, estado):
                perto = (
                    abs((transacao.data - posicao.vencimento).days) <= JANELA_DO_VENCIMENTO_EM_DIAS
                )
                if perto and emissor in f" {normalizar_texto(transacao.descricao)} ":
                    relatorio.para_revisar.append(
                        Achado(
                            "perto_do_vencimento",
                            f"«{posicao.nome}» encerrada com principal "
                            f"{_reais(Dinheiro(principal))}: "
                            f"{transacao.data} {_reais(transacao.valor)} {transacao.sentido.value} "
                            f"({estado.value}) «{transacao.descricao}».",
                        )
                    )
