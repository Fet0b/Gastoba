"""Correção, uma vez, dos espelhos da conta investimentos já gravados (071, D2)."""

from datetime import date
from uuid import uuid4

import pytest

from gastoba.application.corrigir_espelhos_da_conta_investimentos import (
    CorrigirEspelhosDaContaInvestimentos,
)
from gastoba.domain.conta import Conta, OrigemDaConta, TipoDaConta
from gastoba.domain.destinacao import ParteDeDestinacao
from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.ganho import Ganho, OrigemDoGanho
from gastoba.domain.movimento_de_investimento import (
    MovimentoDeInvestimento,
    TipoDeMovimento,
)
from gastoba.domain.tag import Tag
from gastoba.domain.transacao_importada import (
    EstadoDaTransacaoImportada,
    MotivoDaTransacaoIgnorada,
    SentidoDaTransacao,
    TransacaoImportada,
)
from gastoba.domain.tratamento_de_aporte import AcaoDoTratamento, TratamentoDeAporte

USUARIO, OUTRO = uuid4(), uuid4()
DIA = date(2026, 10, 10)
APLICACAO = "CONTA REMUNERADA - APLICAÇÃO AUTOMÁTICA"
RESGATE = "CONTA REMUNERADA - RESGATE APLICAÇÃO"


class Cenario:
    """Um espelho em cada situação da E1, mais controles que não podem mudar."""

    def __init__(self, uow, relogio, usuario=USUARIO):
        self.uow, self.relogio, self.usuario = uow, relogio, usuario
        self.conta = Conta(
            usuario,
            f"Corretora {usuario}",
            Dinheiro(82388),
            origem=OrigemDaConta.OPEN_FINANCE,
            id_externo=f"c-{usuario}",
            tipo=TipoDaConta.REMUNERADA,
        )
        with uow as u:
            u.contas.adicionar(self.conta)
            u.commit()
        self.n = 0

    def transacao(self, descricao, valor, sentido, estado="pendente", motivo=None):
        self.n += 1
        t = TransacaoImportada(
            self.conta.id, f"t{self.n}", DIA, descricao, Dinheiro(valor), sentido
        )
        if estado == "aceita":
            t.aceitar()
        elif estado == "ignorada":
            t.ignorar(motivo)
        with self.uow as u:
            u.transacoes_importadas.adicionar_se_nova(t)
            u.transacoes_importadas.atualizar_estado(t)
            u.commit()
        return t

    def com_ganho(self, valor=15000):
        t = self.transacao(RESGATE, valor, SentidoDaTransacao.ENTRADA, "aceita")
        ganho = Ganho(
            self.conta.id,
            Dinheiro(valor),
            t.descricao,
            DIA,
            transacao_importada_id=t.id,
            origem=OrigemDoGanho.OPEN_FINANCE,
        )
        with self.uow as u:
            u.ganhos.adicionar(ganho)
            u.commit()
        return t, ganho

    def com_aporte(self, valor=15000, *, tratamento=False, tags=()):
        t = self.transacao(APLICACAO, valor, SentidoDaTransacao.SAIDA, "aceita")
        movimento = MovimentoDeInvestimento(
            self.conta.id,
            TipoDeMovimento.APORTE,
            Dinheiro(valor),
            t.descricao,
            DIA,
            transacao_importada_id=t.id,
        )
        with self.uow as u:
            u.movimentos_de_investimento.adicionar(movimento)
            if tags:
                u.destinacoes.adicionar(
                    movimento.id, [ParteDeDestinacao(Tag(g), Dinheiro(valor)) for g in tags]
                )
            if tratamento:
                u.tratamentos.adicionar(
                    self.usuario,
                    TratamentoDeAporte(
                        movimento.id,
                        AcaoDoTratamento.EXCLUIDO,
                        {"transacao_importada_id": str(t.id), "valor_centavos": valor},
                        self.relogio.agora(),
                    ),
                )
            u.commit()
        return t, movimento

    def estado(self, t):
        with self.uow as u:
            atual = u.transacoes_importadas.obter(self.usuario, t.id)
            return atual.estado, atual.motivo_ignorada


def _corrigir(uow, relogio, aplicar, usuario=USUARIO):
    return CorrigirEspelhosDaContaInvestimentos(uow, relogio).executar(usuario, aplicar=aplicar)


def _montar_os_quatro_grupos(c):
    ganho_t, ganho = c.com_ganho()
    aporte_t, aporte = c.com_aporte(tratamento=True)
    pendente = c.transacao(APLICACAO, 171330, SentidoDaTransacao.SAIDA)
    sem_motivo = c.transacao(RESGATE, 9000, SentidoDaTransacao.ENTRADA, "ignorada")
    certa = c.transacao(
        RESGATE,
        500,
        SentidoDaTransacao.ENTRADA,
        "ignorada",
        MotivoDaTransacaoIgnorada.MOVIMENTO_INTERNO_DA_CONTA,
    )
    # Controles: nada disto é espelho.
    emissao = c.transacao("EMISSAO - CDB BANCO FICTICIO", 7000, SentidoDaTransacao.SAIDA)
    rendimento = c.transacao("REMUNERACAO APLICACAO AUTOMATICA", 41, SentidoDaTransacao.ENTRADA)
    return {
        "ganho": (ganho_t, ganho),
        "aporte": (aporte_t, aporte),
        "pendente": pendente,
        "sem_motivo": sem_motivo,
        "certa": certa,
        "controles": [emissao, rendimento],
    }


def test_simulacao_conta_por_grupo_e_nao_escreve_nada(unidade_de_trabalho, relogio):
    c = Cenario(unidade_de_trabalho, relogio)
    g = _montar_os_quatro_grupos(c)
    antes = {
        k: c.estado(v[0] if isinstance(v, tuple) else v) for k, v in g.items() if k != "controles"
    }

    relatorio = _corrigir(unidade_de_trabalho, relogio, aplicar=False)

    assert relatorio.aplicado is False
    assert (relatorio.aceitas_como_ganho.quantidade, relatorio.aceitas_como_ganho.total) == (
        1,
        Dinheiro(15000),
    )
    assert relatorio.aceitas_como_aporte.quantidade == 1
    assert relatorio.pendentes.quantidade == 1 and relatorio.pendentes.total == Dinheiro(171330)
    assert relatorio.ignoradas_sem_motivo.quantidade == 1
    assert relatorio.ja_corretas.quantidade == 1
    assert relatorio.recusadas == {}
    depois = {
        k: c.estado(v[0] if isinstance(v, tuple) else v) for k, v in g.items() if k != "controles"
    }
    assert depois == antes
    assert len(unidade_de_trabalho.confirmado.ganhos) == 1
    assert len(unidade_de_trabalho.confirmado.movimentos_de_investimento) == 1
    assert not unidade_de_trabalho.confirmado.reversoes_de_classificacao
    assert all(not u.aprovado_em for u in unidade_de_trabalho.confirmado.tratamentos.values())


def test_aplicar_deixa_todos_ignorados_com_o_motivo_e_remove_so_o_que_o_espelho_gerou(
    unidade_de_trabalho, relogio
):
    c = Cenario(unidade_de_trabalho, relogio)
    g = _montar_os_quatro_grupos(c)

    relatorio = _corrigir(unidade_de_trabalho, relogio, aplicar=True)

    assert relatorio.aplicado is True and relatorio.recusadas == {}
    esperado = (
        EstadoDaTransacaoImportada.IGNORADA,
        MotivoDaTransacaoIgnorada.MOVIMENTO_INTERNO_DA_CONTA,
    )
    for chave in ("ganho", "aporte", "pendente", "sem_motivo", "certa"):
        t = g[chave][0] if isinstance(g[chave], tuple) else g[chave]
        assert c.estado(t) == esperado, chave
    # O ganho some, com reversão registrada; o aporte tratado continua guardado (FK), só confirmado.
    assert not unidade_de_trabalho.confirmado.ganhos
    assert len(unidade_de_trabalho.confirmado.reversoes_de_classificacao) == 1
    (movimento,) = unidade_de_trabalho.confirmado.movimentos_de_investimento.values()
    assert movimento.id == g["aporte"][1].id
    (tratamento,) = unidade_de_trabalho.confirmado.tratamentos.values()
    assert tratamento.aprovado_em is not None
    with unidade_de_trabalho as u:
        assert u.movimentos_de_investimento.somar_aportes(USUARIO, DIA, DIA) == Dinheiro(0)
        assert u.contas.obter(USUARIO, c.conta.id).saldo == Dinheiro(82388)
    # Controles intactos.
    for controle in g["controles"]:
        assert c.estado(controle) == (EstadoDaTransacaoImportada.PENDENTE, None)
    assert relatorio.lancamentos_removidos == 1 and relatorio.tratamentos_confirmados == 1


def test_aporte_sem_tratamento_e_removido_com_reversao(unidade_de_trabalho, relogio):
    c = Cenario(unidade_de_trabalho, relogio)
    t, _ = c.com_aporte()

    relatorio = _corrigir(unidade_de_trabalho, relogio, aplicar=True)

    assert c.estado(t) == (
        EstadoDaTransacaoImportada.IGNORADA,
        MotivoDaTransacaoIgnorada.MOVIMENTO_INTERNO_DA_CONTA,
    )
    assert not unidade_de_trabalho.confirmado.movimentos_de_investimento
    assert len(unidade_de_trabalho.confirmado.reversoes_de_classificacao) == 1
    assert relatorio.lancamentos_removidos == 1


def test_segunda_execucao_nao_acha_nada_a_fazer(unidade_de_trabalho, relogio):
    c = Cenario(unidade_de_trabalho, relogio)
    _montar_os_quatro_grupos(c)
    _corrigir(unidade_de_trabalho, relogio, aplicar=True)

    de_novo = _corrigir(unidade_de_trabalho, relogio, aplicar=True)

    assert de_novo.nada_a_fazer
    assert de_novo.lancamentos_removidos == 0 and de_novo.tratamentos_confirmados == 0


def test_dependencia_recusa_tudo_e_nao_grava_nada(unidade_de_trabalho, relogio):
    c = Cenario(unidade_de_trabalho, relogio)
    ganho_t, _ = c.com_ganho()
    aporte_t, _ = c.com_aporte(tags=("reserva",))  # destinação: dependência
    pendente = c.transacao(APLICACAO, 100, SentidoDaTransacao.SAIDA)

    relatorio = _corrigir(unidade_de_trabalho, relogio, aplicar=True)

    assert relatorio.aplicado is False
    assert sum(relatorio.recusadas.values()) == 1
    assert c.estado(ganho_t)[0] == EstadoDaTransacaoImportada.ACEITA
    assert c.estado(aporte_t)[0] == EstadoDaTransacaoImportada.ACEITA
    assert c.estado(pendente) == (EstadoDaTransacaoImportada.PENDENTE, None)
    assert len(unidade_de_trabalho.confirmado.ganhos) == 1
    assert not unidade_de_trabalho.confirmado.reversoes_de_classificacao


def test_falha_no_meio_nao_grava_o_que_veio_antes(unidade_de_trabalho, relogio, monkeypatch):
    c = Cenario(unidade_de_trabalho, relogio)
    primeiro, _ = c.com_ganho(1000)
    segundo, _ = c.com_ganho(2000)
    chamadas = []
    original = unidade_de_trabalho.transacoes_importadas.__class__.atualizar_estado

    def quebrar(self, transacao):
        chamadas.append(transacao.id)
        if len(chamadas) == 3:
            raise RuntimeError("falha simulada")
        return original(self, transacao)

    monkeypatch.setattr(
        unidade_de_trabalho.transacoes_importadas.__class__, "atualizar_estado", quebrar
    )

    with pytest.raises(RuntimeError):
        _corrigir(unidade_de_trabalho, relogio, aplicar=True)

    monkeypatch.undo()
    assert c.estado(primeiro)[0] == EstadoDaTransacaoImportada.ACEITA
    assert c.estado(segundo)[0] == EstadoDaTransacaoImportada.ACEITA
    assert len(unidade_de_trabalho.confirmado.ganhos) == 2


def test_so_a_pessoa_do_email_e_corrigida(unidade_de_trabalho, relogio):
    meu = Cenario(unidade_de_trabalho, relogio, USUARIO)
    alheio = Cenario(unidade_de_trabalho, relogio, OUTRO)
    t_meu, _ = meu.com_ganho()
    t_alheio, _ = alheio.com_ganho()

    _corrigir(unidade_de_trabalho, relogio, aplicar=True, usuario=USUARIO)

    assert meu.estado(t_meu)[0] == EstadoDaTransacaoImportada.IGNORADA
    assert alheio.estado(t_alheio)[0] == EstadoDaTransacaoImportada.ACEITA
    assert len(unidade_de_trabalho.confirmado.ganhos) == 1
