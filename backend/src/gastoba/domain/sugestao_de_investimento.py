import re
from collections.abc import Collection, Sequence
from datetime import date, timedelta
from uuid import UUID

from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.investimento import Investimento, PontoDoHistorico
from gastoba.domain.natureza_do_movimento import (
    TIPO_DA_CAIXINHA,
    NaturezaDoMovimento,
    natureza_da_descricao,
)
from gastoba.domain.texto import normalizar_texto
from gastoba.domain.transacao_importada import (
    EstadoDaTransacaoImportada,
    SentidoDaTransacao,
    TransacaoImportada,
)


def sugerir_investimento(
    transacao: TransacaoImportada,
    posicoes: Sequence[Investimento],
    investimentos_com_movimento: Collection[UUID],
    historico: Sequence[PontoDoHistorico] = (),
) -> UUID | None:
    """A posição de que a saída pendente parece ser o aporte (a emissão do título), se houver uma.

    Casa a posição cujo nome normalizado aparece, em palavras inteiras, na descrição normalizada,
    cujo ``valor_aplicado`` é igual ao valor da transação e que ainda não tem nenhum movimento
    associado. Se mais de uma casa, não adivinha: devolve ``None``, como quando nenhuma casa.
    """
    if transacao.estado != EstadoDaTransacaoImportada.PENDENTE:
        return None
    natureza = natureza_da_descricao(transacao.descricao)
    if natureza == NaturezaDoMovimento.CONTA_REMUNERADA:
        return _sugerir_a_caixinha(transacao, posicoes)
    if natureza == NaturezaDoMovimento.LIQUIDACAO_DE_BOLSA:
        return _sugerir_pela_liquidacao(transacao, posicoes, historico)
    if transacao.sentido == SentidoDaTransacao.ENTRADA:
        return _sugerir_pelo_vencimento(transacao, posicoes)
    descricao = f" {normalizar_texto(transacao.descricao)} "
    candidatas = []
    for posicao in posicoes:
        nome = normalizar_texto(posicao.nome)
        if (
            nome
            and posicao.valor_aplicado == transacao.valor
            and posicao.id not in investimentos_com_movimento
            and f" {nome} " in descricao
        ):
            candidatas.append(posicao.id)
    return candidatas[0] if len(candidatas) == 1 else None


_VENCIMENTO_NA_DESCRICAO = re.compile(r"venc\.?:?\s*(\d{4})-(\d{2})-(\d{2})", re.IGNORECASE)


def _vencimento_da_descricao(descricao: str) -> date | None:
    achado = _VENCIMENTO_NA_DESCRICAO.search(descricao)
    if achado is None:
        return None
    try:
        return date(int(achado[1]), int(achado[2]), int(achado[3]))
    except ValueError:
        return None


def _sugerir_pelo_vencimento(
    transacao: TransacaoImportada, posicoes: Sequence[Investimento]
) -> UUID | None:
    return investimento_do_vencimento(transacao.descricao, posicoes)


def investimento_do_vencimento(descricao: str, posicoes: Sequence[Investimento]) -> UUID | None:
    """A posição de que a descrição é o resgate no vencimento (``VENCIMENTO - <emissor> - Venc.:
    AAAA-MM-DD <código>``): casa pela data de vencimento e pelo emissor em palavras inteiras; o
    código do título, se a descrição o traz, desempata. Ambiguidade devolve ``None``."""
    if natureza_da_descricao(descricao) != NaturezaDoMovimento.VENCIMENTO:
        return None
    vencimento = _vencimento_da_descricao(descricao)
    if vencimento is None:
        return None
    texto = f" {normalizar_texto(descricao)} "
    candidatas = []
    for posicao in posicoes:
        emissor = normalizar_texto(posicao.emissor or "")
        if posicao.vencimento == vencimento and emissor and f" {emissor} " in texto:
            candidatas.append(posicao)
    if len(candidatas) > 1:
        candidatas = [
            p for p in candidatas if p.codigo and f" {normalizar_texto(p.codigo)} " in texto
        ]
    return candidatas[0].id if len(candidatas) == 1 else None


def _sugerir_a_caixinha(
    transacao: TransacaoImportada, posicoes: Sequence[Investimento]
) -> UUID | None:
    """A aplicação e o resgate automáticos da conta remunerada pertencem à caixinha da própria
    conta, identificada pela FK explícita."""
    achadas = [
        p.id
        for p in posicoes
        if p.tipo == TIPO_DA_CAIXINHA and p.conta_remunerada_id == transacao.conta_id
    ]
    return achadas[0] if len(achadas) == 1 else None


TIPOS_NEGOCIADOS_EM_BOLSA = frozenset({"EQUITY", "ETF", "MUTUAL_FUND"})
# A liquidação cai D+2 depois do pregão, e o saldo da posição muda no pregão: olha-se em volta.
FOLGA_ANTES_EM_DIAS = 3
FOLGA_DEPOIS_EM_DIAS = 4
# O saldo também varia com o mercado: aceita 3% (ou R$ 5,00) de diferença entre variação e valor.
TOLERANCIA_PERCENTUAL = 3
TOLERANCIA_MINIMA = Dinheiro(500)
_PREGAO = re.compile(r"preg[aã]o:?\s*(\d{2})/(\d{2})/(\d{4})", re.IGNORECASE)


def _dia_do_pregao(transacao: TransacaoImportada) -> date:
    achado = _PREGAO.search(transacao.descricao)
    if achado is not None:
        try:
            return date(int(achado[3]), int(achado[2]), int(achado[1]))
        except ValueError:
            pass
    return transacao.data


def _sugerir_pela_liquidacao(
    transacao: TransacaoImportada,
    posicoes: Sequence[Investimento],
    historico: Sequence[PontoDoHistorico],
) -> UUID | None:
    """A ação ou fundo cujo saldo variou, em volta do pregão, quase o valor da liquidação.

    Compra (saída) é alta do saldo; venda (entrada) é queda. A posição que ainda não existia
    antes conta como saldo zero. Só sugere se exatamente uma posição casa; senão, nada.
    """
    pregao = _dia_do_pregao(transacao)
    inicio = pregao - timedelta(days=FOLGA_ANTES_EM_DIAS)
    fim = pregao + timedelta(days=FOLGA_DEPOIS_EM_DIAS)
    tolerancia = max(
        transacao.valor.centavos * TOLERANCIA_PERCENTUAL // 100, TOLERANCIA_MINIMA.centavos
    )
    sinal = 1 if transacao.sentido == SentidoDaTransacao.SAIDA else -1
    candidatas = []
    for posicao in posicoes:
        if posicao.tipo not in TIPOS_NEGOCIADOS_EM_BOLSA:
            continue
        pontos = sorted(
            (p for p in historico if p.investimento_id == posicao.id), key=lambda p: p.data
        )
        antes = [p for p in pontos if p.data < inicio]
        dentro = [p for p in pontos if inicio <= p.data <= fim]
        if not dentro:
            continue
        saldo_antes = antes[-1].saldo.centavos if antes else 0
        variacao = sinal * (dentro[-1].saldo.centavos - saldo_antes)
        if abs(variacao - transacao.valor.centavos) <= tolerancia:
            candidatas.append(posicao.id)
    return candidatas[0] if len(candidatas) == 1 else None
