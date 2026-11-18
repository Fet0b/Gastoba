"""Propostas de ligação entre as operações da corretora e os lançamentos da conta (frente 061).

Domínio puro: recebe operações e transações já lidas, com a situação atual de cada transação, e
devolve propostas. Nunca escolhe por palpite: só é ``exata`` a proposta única; o resto
``precisa_escolher``."""

import hashlib
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import date
from enum import StrEnum
from itertools import combinations
from uuid import UUID

from gastoba.domain.casamento_de_liquidacao import (
    Tolerancia,
    data_do_pregao,
    e_liquidacao_bruta,
    e_taxa_de_liquidacao,
)
from gastoba.domain.casamento_de_resgate_de_renda_fixa import (
    TIPOS_DE_RESGATE,
    combinacoes_do_bruto,
    debito_do_imposto,
)
from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.operacao import Operacao, TipoDeOperacao
from gastoba.domain.texto import normalizar_texto
from gastoba.domain.transacao_importada import SentidoDaTransacao, TransacaoImportada

MAXIMO_DE_OPERACOES_NO_PREGAO = 6
EXATA = "exata"
PRECISA_ESCOLHER = "precisa_escolher"


class SituacaoDaTransacao(StrEnum):
    PENDENTE = "pendente"
    APORTE_SEM_INVESTIMENTO = "aporte_sem_investimento"
    RESGATE_SEM_INVESTIMENTO = "resgate_sem_investimento"
    GANHO = "ganho"
    APORTE_DE_OUTRA_POSICAO = "aporte_de_outra_posicao"
    IGNORADA = "ignorada"
    CASADA = "casada"
    # Parte de uma divisão: não se liga sem desfazer a divisão antes.
    DIVIDIDA = "dividida"


_FORA_DA_REVISAO = (
    SituacaoDaTransacao.IGNORADA,
    SituacaoDaTransacao.CASADA,
    SituacaoDaTransacao.DIVIDIDA,
)


@dataclass(frozen=True, slots=True)
class TransacaoNaRevisao:
    transacao: TransacaoImportada
    situacao: SituacaoDaTransacao


@dataclass(frozen=True, slots=True)
class OperacaoNaRevisao:
    operacao: Operacao
    rotulo: str
    code: str | None = None
    renda_fixa: bool = False


@dataclass(frozen=True, slots=True)
class EfeitoDaProposta:
    transacao_id: UUID
    # ``aporte_passa_a_ser_da_posicao``, ``taxa_deixa_de_ser_aporte``, ``ganho_deixa_de_ser_renda``
    # ou ``aceita_a_pendente``.
    codigo: str


@dataclass(frozen=True, slots=True)
class PropostaDeCasamento:
    chave: str
    tipo: str  # compra_na_bolsa | venda_na_bolsa | resgate_de_renda_fixa
    data_do_pregao: date
    operacoes: tuple[OperacaoNaRevisao, ...]
    bruto: tuple[TransacaoNaRevisao, ...]
    taxas: tuple[TransacaoNaRevisao, ...]
    # Bruto da conta menos bruto das operações; custo da conta menos custo das operações (centavos).
    diferenca: int
    diferenca_de_custo: int
    confianca: str
    motivo: str | None
    efeitos: tuple[EfeitoDaProposta, ...]


@dataclass(frozen=True, slots=True)
class ItemSemPar:
    motivo: str
    operacao_id: UUID | None = None
    transacao_id: UUID | None = None
    # O que é o item (ex.: "Compra de AUVP11 (3)" ou a descrição do banco), com data e valor, para a
    # pessoa saber do que se trata sem procurar.
    descricao: str = ""
    data: date | None = None
    valor: Dinheiro | None = None


@dataclass(frozen=True, slots=True)
class ResultadoDaRevisao:
    propostas: tuple[PropostaDeCasamento, ...]
    sem_par: tuple[ItemSemPar, ...]


def _sem_par_da_transacao(motivo: str, t: TransacaoNaRevisao) -> ItemSemPar:
    return ItemSemPar(
        motivo,
        transacao_id=t.transacao.id,
        descricao=t.transacao.descricao,
        data=t.transacao.data,
        valor=t.transacao.valor,
    )


def _sem_par_da_operacao(motivo: str, o: OperacaoNaRevisao) -> ItemSemPar:
    verbo = "Venda" if o.operacao.tipo == TipoDeOperacao.VENDA else "Compra"
    return ItemSemPar(
        motivo,
        operacao_id=o.operacao.id,
        descricao=f"{verbo} de {o.rotulo} ({o.operacao.quantidade.normalize():f})",
        data=o.operacao.data,
        valor=o.operacao.valor_bruto,
    )


def _chave(operacoes: Sequence[OperacaoNaRevisao], transacoes: Sequence[TransacaoNaRevisao]) -> str:
    ids = sorted(str(o.operacao.id) for o in operacoes) + sorted(
        str(t.transacao.id) for t in transacoes
    )
    return hashlib.sha256("|".join(ids).encode()).hexdigest()[:16]


def _efeitos(
    bruto: Sequence[TransacaoNaRevisao], taxas: Sequence[TransacaoNaRevisao]
) -> tuple[EfeitoDaProposta, ...]:
    efeitos = []
    for t in (*bruto, *taxas):
        id_ = t.transacao.id
        eh_taxa = t in taxas
        if t.situacao == SituacaoDaTransacao.PENDENTE:
            efeitos.append(EfeitoDaProposta(id_, "aceita_a_pendente"))
        elif t.situacao == SituacaoDaTransacao.GANHO:
            efeitos.append(EfeitoDaProposta(id_, "ganho_deixa_de_ser_renda"))
        elif t.situacao in (
            SituacaoDaTransacao.APORTE_SEM_INVESTIMENTO,
            SituacaoDaTransacao.RESGATE_SEM_INVESTIMENTO,
            SituacaoDaTransacao.APORTE_DE_OUTRA_POSICAO,
        ):
            codigo = "taxa_deixa_de_ser_aporte" if eh_taxa else "aporte_passa_a_ser_da_posicao"
            efeitos.append(EfeitoDaProposta(id_, codigo))
    return tuple(efeitos)


def _proposta(
    tipo: str,
    data: date,
    operacoes: Sequence[OperacaoNaRevisao],
    bruto: Sequence[TransacaoNaRevisao],
    taxas: Sequence[TransacaoNaRevisao],
    confianca: str,
    motivo: str | None,
) -> PropostaDeCasamento:
    if any(t.situacao == SituacaoDaTransacao.APORTE_DE_OUTRA_POSICAO for t in (*bruto, *taxas)):
        confianca = PRECISA_ESCOLHER
        motivo = motivo or "O lançamento já está ligado a outra posição."
    return PropostaDeCasamento(
        chave=_chave(operacoes, (*bruto, *taxas)),
        tipo=tipo,
        data_do_pregao=data,
        operacoes=tuple(operacoes),
        bruto=tuple(bruto),
        taxas=tuple(taxas),
        diferenca=sum(t.transacao.valor.centavos for t in bruto)
        - sum(o.operacao.valor_bruto.centavos for o in operacoes),
        diferenca_de_custo=sum(t.transacao.valor.centavos for t in taxas)
        - sum(o.operacao.custos.centavos for o in operacoes),
        confianca=confianca,
        motivo=motivo,
        efeitos=_efeitos(bruto, taxas),
    )


def _elegivel(t: TransacaoNaRevisao) -> bool:
    return t.situacao not in _FORA_DA_REVISAO


def _propostas_de_bolsa(
    operacoes: Sequence[OperacaoNaRevisao],
    transacoes: Sequence[TransacaoNaRevisao],
    tolerancia: Tolerancia,
) -> tuple[list[PropostaDeCasamento], list[ItemSemPar], set[UUID]]:
    brutos = [t for t in transacoes if _elegivel(t) and e_liquidacao_bruta(t.transacao.descricao)]
    taxas_livres = [
        t for t in transacoes if _elegivel(t) and e_taxa_de_liquidacao(t.transacao.descricao)
    ]
    sem_par: list[ItemSemPar] = []
    brutas: list[tuple[TransacaoNaRevisao, date, str, list[OperacaoNaRevisao], bool]] = []
    for b in brutos:
        pregao = data_do_pregao(b.transacao.descricao)
        if pregao is None:
            sem_par.append(_sem_par_da_transacao("Sem a data do pregão na descrição.", b))
            continue
        tipo = (
            TipoDeOperacao.COMPRA
            if b.transacao.sentido == SentidoDaTransacao.SAIDA
            else TipoDeOperacao.VENDA
        )
        pool = [
            o
            for o in operacoes
            if not o.renda_fixa
            and o.operacao.tipo == tipo
            and abs((pregao - o.operacao.data).days) <= tolerancia.dias
        ]
        if len(pool) > MAXIMO_DE_OPERACOES_NO_PREGAO:
            brutas.append((b, pregao, tipo.value, pool, True))
            continue
        achados = [
            grupo
            for tamanho in range(1, len(pool) + 1)
            for grupo in combinations(pool, tamanho)
            if abs(sum(o.operacao.valor_bruto.centavos for o in grupo) - b.transacao.valor.centavos)
            <= tolerancia.centavos
        ]
        if not achados:
            sem_par.append(_sem_par_da_transacao("Nenhuma operação soma este valor.", b))
        elif len(achados) == 1:
            brutas.append((b, pregao, tipo.value, list(achados[0]), False))
        else:
            uniao = [o for o in pool if any(o in g for g in achados)]
            brutas.append((b, pregao, tipo.value, uniao, True))
    uso_de_operacao: dict[UUID, int] = {}
    for _, _, _, ops, _ in brutas:
        for o in ops:
            uso_de_operacao[o.operacao.id] = uso_de_operacao.get(o.operacao.id, 0) + 1
    por_pregao: dict[tuple[UUID, date], int] = {}
    for b, pregao, _, _, _ in brutas:
        chave_do_pregao = (b.transacao.conta_id, pregao)
        por_pregao[chave_do_pregao] = por_pregao.get(chave_do_pregao, 0) + 1
    propostas = []
    usadas: set[UUID] = set()
    taxas_usadas: set[UUID] = set()
    for b, pregao, tipo_op, ops, ambigua in brutas:
        compartilhada = any(uso_de_operacao[o.operacao.id] > 1 for o in ops)
        motivo = None
        if ambigua:
            motivo = "Há mais de uma combinação possível de operações para este valor."
        elif compartilhada:
            motivo = "Outro lançamento do mesmo valor também serve a estas operações."
        taxas = []
        if por_pregao[(b.transacao.conta_id, pregao)] == 1:
            taxas = [
                t
                for t in taxas_livres
                if t.transacao.conta_id == b.transacao.conta_id
                and (data_do_pregao(t.transacao.descricao) or t.transacao.data)
                == (pregao if data_do_pregao(t.transacao.descricao) else b.transacao.data)
            ]
        taxas_usadas.update(t.transacao.id for t in taxas)
        tipo = "compra_na_bolsa" if tipo_op == TipoDeOperacao.COMPRA.value else "venda_na_bolsa"
        propostas.append(
            _proposta(tipo, pregao, ops, [b], taxas, PRECISA_ESCOLHER if motivo else EXATA, motivo)
        )
        usadas.update(o.operacao.id for o in ops)
    for t in taxas_livres:
        if t.transacao.id not in taxas_usadas:
            sem_par.append(_sem_par_da_transacao("Taxa sem a liquidação bruta.", t))
    return propostas, sem_par, usadas


def _termina_com_codigo(transacao: TransacaoImportada, code: str | None) -> bool:
    if not code:
        return False
    return normalizar_texto(transacao.descricao).endswith(normalizar_texto(code))


def _propostas_de_renda_fixa(
    operacoes: Sequence[OperacaoNaRevisao],
    transacoes: Sequence[TransacaoNaRevisao],
    tolerancia: Tolerancia,
) -> list[PropostaDeCasamento]:
    elegiveis = [t for t in transacoes if _elegivel(t)]
    por_id = {t.transacao.id: t for t in elegiveis}
    brutas = []
    for o in operacoes:
        if not o.renda_fixa or o.operacao.tipo not in TIPOS_DE_RESGATE:
            continue
        contas = {t.transacao.conta_id for t in elegiveis}
        entradas_por_conta = {
            conta: [
                t.transacao
                for t in elegiveis
                if t.transacao.conta_id == conta
                and t.transacao.sentido == SentidoDaTransacao.ENTRADA
                and abs((t.transacao.data - o.operacao.data).days) <= tolerancia.dias
                and not t.transacao.descricao.upper().startswith("LIQ BOLSA")
            ]
            for conta in contas
        }
        combinacoes = [
            (conta, g)
            for conta, entradas in entradas_por_conta.items()
            for g in combinacoes_do_bruto(o.operacao, entradas, tolerancia)
        ]
        brutas.append((o, combinacoes, entradas_por_conta))
    resolvidas = []
    for o, combinacoes, entradas_por_conta in brutas:
        outras_iguais = sum(
            1
            for o2, c2, _ in brutas
            if o2 is not o
            and {tuple(t.id for t in g) for _, g in c2}
            & {tuple(t.id for t in g) for _, g in combinacoes}
        )
        if (len(combinacoes) != 1 or outras_iguais) and o.code:
            filtradas = [
                (conta, g)
                for conta, entradas in entradas_por_conta.items()
                for g in combinacoes_do_bruto(
                    o.operacao,
                    [t for t in entradas if _termina_com_codigo(t, o.code)],
                    tolerancia,
                )
            ]
            if len(filtradas) == 1:
                combinacoes = filtradas
                outras_iguais = 0
        resolvidas.append((o, combinacoes, outras_iguais))
    propostas = []
    for o, combinacoes, outras_iguais in resolvidas:
        if not combinacoes:
            continue
        exata = len(combinacoes) == 1 and not outras_iguais
        # Entrada que também serve a outra operação com código resolvido não é compartilhada.
        grupo = (
            combinacoes[0][1]
            if exata
            else tuple({t.id: t for _, g in combinacoes for t in g}.values())
        )
        conta = combinacoes[0][0]
        imposto = debito_do_imposto(o.operacao, conta, [t.transacao for t in elegiveis], tolerancia)
        taxas = [por_id[imposto.id]] if imposto is not None else []
        propostas.append(
            _proposta(
                "resgate_de_renda_fixa",
                o.operacao.data,
                [o],
                [por_id[t.id] for t in grupo],
                taxas,
                EXATA if exata else PRECISA_ESCOLHER,
                None if exata else "Mais de um lançamento ou posição serve a este resgate.",
            )
        )
    return propostas


def propor_casamentos(
    operacoes: Sequence[OperacaoNaRevisao],
    transacoes: Sequence[TransacaoNaRevisao],
    tolerancia: Tolerancia,
) -> ResultadoDaRevisao:
    bolsa = [
        o
        for o in operacoes
        if not o.renda_fixa and o.operacao.tipo in (TipoDeOperacao.COMPRA, TipoDeOperacao.VENDA)
    ]
    propostas_bolsa, sem_par, usadas = _propostas_de_bolsa(bolsa, transacoes, tolerancia)
    propostas = propostas_bolsa + _propostas_de_renda_fixa(operacoes, transacoes, tolerancia)
    for t in transacoes:
        if t.situacao == SituacaoDaTransacao.DIVIDIDA and e_liquidacao_bruta(t.transacao.descricao):
            sem_par.append(
                _sem_par_da_transacao("Lançamento dividido: desfaça a divisão antes.", t)
            )
    for o in bolsa:
        if o.operacao.id not in usadas:
            sem_par.append(
                _sem_par_da_operacao("Nenhum lançamento corresponde a esta operação.", o)
            )
    return ResultadoDaRevisao(tuple(propostas), tuple(sem_par))
