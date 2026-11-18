"""Snapshots de classificação na trilha de auditoria, dentro da UoW de quem chama."""

from datetime import date
from uuid import UUID

from gastoba.domain.destinacao import ParteDeDestinacao
from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.excecoes import MovimentoNaoDesfazivel
from gastoba.domain.movimento_de_investimento import MovimentoDeInvestimento
from gastoba.domain.reversao_de_classificacao import ReversaoDeClassificacao
from gastoba.domain.tag import Tag


def fotografar_saldos_iniciais(uow, usuario_id, investimento_id):
    resultado = {}
    for m in uow.movimentos_de_investimento.saldos_iniciais_do_investimento(
        usuario_id, investimento_id
    ):
        partes = uow.destinacoes.do_movimento([m.id]).get(m.id, [])
        resultado[str(m.id)] = {
            "id": str(m.id),
            "investimento_id": str(investimento_id),
            "data": m.data.isoformat(),
            "valor_centavos": m.valor.centavos,
            "partes": sorted([[t.valor, v.centavos] for t, v in partes]),
        }
    return resultado


def registrar_abatimentos(uow, usuario_id, movimento, antes, depois):
    if antes == depois:
        return
    if movimento.transacao_importada_id is None:
        raise MovimentoNaoDesfazivel(
            "Identifique a transação para auditar o abatimento do saldo inicial."
        )
    t = uow.transacoes_importadas.obter(usuario_id, movimento.transacao_importada_id)
    investimento_id = UUID(next(iter(antes.values()))["investimento_id"])
    movimentos_preservados = [
        str(m.id)
        for m in uow.movimentos_de_investimento.listar(usuario_id, date.min, date.max)
        if m.investimento_id == investimento_id
        and m.id != movimento.id
        and m.origem.value != "saldo_inicial"
    ]
    registros = tuple(
        {
            "tipo": "AbatimentoDeSaldoInicial",
            "movimento_id": str(movimento.id),
            "antes": snapshot,
            "depois": depois.get(id_inicial),
            "saldos_apos": depois,
            "movimentos_preservados": movimentos_preservados,
        }
        for id_inicial, snapshot in antes.items()
        if snapshot != depois.get(id_inicial)
    )
    uow.transacoes_importadas.registrar_reversao(
        ReversaoDeClassificacao(
            usuario_id,
            t.id,
            t.estado.value,
            registros,
        )
    )


def restaurar_abatimentos(uow, usuario_id, transacao_id, movimentos):
    ids = {str(m.id) for m in movimentos}
    registros = [
        r
        for r in uow.transacoes_importadas.abatimentos_da_transacao(usuario_id, transacao_id)
        if r["movimento_id"] in ids
    ]
    # Uma divisão pode abater o mesmo saldo em mais de uma parte: desfazer na ordem inversa.
    restaurados = set()
    for r in reversed(registros):
        antes, depois = r["antes"], r["depois"]
        investimento_id = UUID(antes["investimento_id"])
        saldos_atuais = fotografar_saldos_iniciais(uow, usuario_id, investimento_id)
        atual = saldos_atuais.get(antes["id"])
        movimentos_atuais = {
            str(m.id)
            for m in uow.movimentos_de_investimento.listar(usuario_id, date.min, date.max)
            if m.investimento_id == investimento_id and m.origem.value != "saldo_inicial"
        }
        posteriores = movimentos_atuais - set(r["movimentos_preservados"]) - ids
        preservados_atuais = {k: v for k, v in saldos_atuais.items() if k not in restaurados}
        preservados_esperados = {k: v for k, v in r["saldos_apos"].items() if k not in restaurados}
        if atual != depois or posteriores or preservados_atuais != preservados_esperados:
            raise MovimentoNaoDesfazivel(
                "O saldo inicial foi alterado depois desta classificação. "
                "Desfaça primeiro os aportes posteriores ou revise o saldo inicial. "
                "Nada foi alterado."
            )
        if atual is not None:
            uow.movimentos_de_investimento.excluir(UUID(antes["id"]))
        inicial = MovimentoDeInvestimento.de_saldo_inicial(
            investimento_id,
            Dinheiro(antes["valor_centavos"]),
            date.fromisoformat(antes["data"]),
        )
        inicial.id = UUID(antes["id"])
        uow.movimentos_de_investimento.adicionar(inicial)
        uow.destinacoes.adicionar(
            inicial.id,
            [ParteDeDestinacao(Tag(tag), Dinheiro(valor)) for tag, valor in antes["partes"]],
        )
        restaurados.add(antes["id"])
