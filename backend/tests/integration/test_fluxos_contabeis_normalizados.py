"""Fluxos 054 sobre as relações 055, pelo UoW real com SQLite temporário."""

from datetime import date

from gastoba.application.aceitar_transacao_importada import AceitarTransacaoImportada
from gastoba.application.classificar_transferencia import ClassificarTransferencia
from gastoba.application.consultar_impacto_da_reversao import ConsultarImpactoDaReversao
from gastoba.application.definir_caixinha import DefinirCaixinha
from gastoba.application.desfazer_classificacao_importada import DesfazerClassificacaoImportada
from gastoba.domain.conta import Conta, OrigemDaConta, PapelDaConta
from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.movimento_de_investimento import TipoDeMovimento
from gastoba.domain.transacao_importada import SentidoDaTransacao, TransacaoImportada
from gastoba.domain.usuario import Usuario
from gastoba.infrastructure.persistencia.unidade_de_trabalho import UnidadeDeTrabalhoSqlAlchemy


def test_caixinha_real_atualiza_pela_fk_e_aceita_rendimento(fabrica_de_sessoes):
    uow = UnidadeDeTrabalhoSqlAlchemy(fabrica_de_sessoes)
    pessoa = Usuario("Pessoa")
    conta = Conta(
        pessoa.id, "Banco", Dinheiro(50000), origem=OrigemDaConta.OPEN_FINANCE, id_externo="banco"
    )
    with uow as u:
        u.usuarios.garantir(pessoa)
        u.contas.adicionar(conta)
        u.commit()
    caso = DefinirCaixinha(uow)
    inv = caso.executar(pessoa.id, conta.id, Dinheiro(10000), date(2026, 11, 1))
    assert inv.conta_remunerada_id == conta.id
    assert not inv.id_externo.startswith("caixinha:")
    depois = caso.executar(pessoa.id, conta.id, Dinheiro(10100), date(2026, 11, 8))
    assert depois.id == inv.id and depois.conta_remunerada_id == conta.id
    t = TransacaoImportada(
        conta.id,
        "rendimento",
        date(2026, 11, 8),
        "CONTA REMUNERADA - RENDIMENTO",
        Dinheiro(100),
        SentidoDaTransacao.ENTRADA,
    )
    with uow as u:
        u.transacoes_importadas.adicionar_se_nova(t)
        u.commit()
    m = AceitarTransacaoImportada(uow).executar(
        pessoa.id,
        t.id,
        None,
        [],
        como_investimento=True,
        investimento_id=inv.id,
        tipo_de_movimento=TipoDeMovimento.RENDIMENTO,
    )
    assert m.investimento_id == inv.id and m.tipo == TipoDeMovimento.RENDIMENTO


def test_transferencia_real_classifica_reverte_e_preserva_saldo(fabrica_de_sessoes):
    uow = UnidadeDeTrabalhoSqlAlchemy(fabrica_de_sessoes)
    pessoa = Usuario("Pessoa")
    origem = Conta(
        pessoa.id,
        "Banco",
        Dinheiro(10000),
        origem=OrigemDaConta.OPEN_FINANCE,
        id_externo="origem",
        papel=PapelDaConta.CORRENTE,
    )
    destino = Conta(
        pessoa.id,
        "Corretora",
        Dinheiro(20000),
        origem=OrigemDaConta.OPEN_FINANCE,
        id_externo="destino",
        papel=PapelDaConta.INVESTIMENTO,
    )
    saida = TransacaoImportada(
        origem.id,
        "saida",
        date(2026, 11, 8),
        "Transferência",
        Dinheiro(300),
        SentidoDaTransacao.SAIDA,
    )
    entrada = TransacaoImportada(
        destino.id,
        "entrada",
        date(2026, 11, 8),
        "Transferência",
        Dinheiro(300),
        SentidoDaTransacao.ENTRADA,
    )
    with uow as u:
        u.usuarios.garantir(pessoa)
        u.contas.adicionar(origem)
        u.contas.adicionar(destino)
        u.transacoes_importadas.adicionar_se_nova(saida)
        u.transacoes_importadas.adicionar_se_nova(entrada)
        u.commit()
    feita = ClassificarTransferencia(uow).executar(pessoa.id, saida.id, destino.id, entrada.id)
    assert feita.aporte_liquido == Dinheiro(300)
    previa = ConsultarImpactoDaReversao(uow).executar(pessoa.id, entrada.id)
    DesfazerClassificacaoImportada(uow).executar(
        pessoa.id, entrada.id, versao_esperada=previa.versao, desfazer_divisao_inteira=True
    )
    with uow as u:
        assert u.transferencias.da_transacao(pessoa.id, saida.id) is None
        assert u.contas.obter(pessoa.id, origem.id).saldo == Dinheiro(10000)
        assert u.contas.obter(pessoa.id, destino.id).saldo == Dinheiro(20000)
    refeita = ClassificarTransferencia(uow).executar(pessoa.id, saida.id, destino.id, entrada.id)
    assert refeita.id != feita.id


def test_regressao_liq_preserva_gasto_e_custo_e_conta_so_transferencia_liquida(fabrica_de_sessoes):
    """R2–R6: compra e taxas não duplicam a transferência nem a despesa real."""
    from uuid import uuid4

    from gastoba.application.consultar_progresso_das_metas import ConsultarProgressoDasMetas
    from gastoba.application.definir_meta import DefinirMeta
    from gastoba.domain.categoria import CategoriaDoGasto
    from gastoba.domain.destinacao import Destinacao
    from gastoba.domain.mes import Mes
    from gastoba.domain.meta import AlvoDaMeta
    from gastoba.domain.portas import InvestimentoExterno
    from gastoba.domain.tag import Tag

    uow = UnidadeDeTrabalhoSqlAlchemy(fabrica_de_sessoes)
    pessoa = Usuario("Pessoa fictícia")
    corrente = Conta(
        pessoa.id,
        "Corrente",
        Dinheiro(100000),
        origem=OrigemDaConta.OPEN_FINANCE,
        id_externo="corrente",
        papel=PapelDaConta.CORRENTE,
    )
    corretora = Conta(
        pessoa.id,
        "Corretora",
        Dinheiro(300000),
        origem=OrigemDaConta.OPEN_FINANCE,
        id_externo="corretora",
        papel=PapelDaConta.INVESTIMENTO,
    )
    with uow as u:
        u.usuarios.garantir(pessoa)
        u.contas.adicionar(corrente)
        u.contas.adicionar(corretora)
        u.investimentos.salvar_posicao(
            pessoa.id,
            InvestimentoExterno("acao", "Ação fictícia", "EQUITY", None, Dinheiro(278930), "{}"),
        )
        inv = u.investimentos.listar_posicoes(pessoa.id)[0]
        u.commit()

    def importar(conta, valor, sentido, descricao):
        transacao = TransacaoImportada(
            conta.id,
            str(uuid4()),
            date(2026, 11, 4),
            descricao,
            Dinheiro(valor),
            sentido,
        )
        with uow as u:
            u.transacoes_importadas.adicionar_se_nova(transacao)
            u.commit()
        return transacao

    aceitar = AceitarTransacaoImportada(uow)
    gasto = importar(corrente, 3200, SentidoDaTransacao.SAIDA, "Lazer fictício")
    aceitar.executar(pessoa.id, gasto.id, CategoriaDoGasto.LAZER, [])
    compra = importar(corretora, 278930, SentidoDaTransacao.SAIDA, "LIQ BOLSA - VISTA BRUTO")
    movimento = aceitar.executar(
        pessoa.id,
        compra.id,
        None,
        [],
        como_investimento=True,
        investimento_id=inv.id,
        destinacoes=[Destinacao(Tag("patrimonio"), 100)],
    )
    for valor in (62, 13, 7):
        taxa = importar(corretora, valor, SentidoDaTransacao.SAIDA, "Taxa fictícia")
        aceitar.executar(
            pessoa.id,
            taxa.id,
            None,
            [],
            como_investimento=True,
            investimento_id=inv.id,
            tipo_de_movimento=TipoDeMovimento.CUSTO,
            movimento_relacionado_id=movimento.id,
        )
    from gastoba.infrastructure.relogio_do_sistema import RelogioDoSistema

    for alvo in (AlvoDaMeta.LAZER, AlvoDaMeta.LIBERDADE_FINANCEIRA):
        DefinirMeta(uow, RelogioDoSistema()).executar(pessoa.id, alvo, 50)
    consulta = ConsultarProgressoDasMetas(uow)

    def conferir(liquido):
        resumo = consulta.executar(pessoa.id, Mes(2026, 11))
        por_alvo = {p.alvo: p.gasto for p in resumo.progressos}
        assert por_alvo[AlvoDaMeta.LAZER] == Dinheiro(3200)
        assert por_alvo[AlvoDaMeta.LIBERDADE_FINANCEIRA] == Dinheiro(278930)
        with uow as u:
            assert u.gastos.somar_por_categoria(
                pessoa.id, date(2026, 11, 1), date(2026, 11, 30)
            ) == {CategoriaDoGasto.LAZER: Dinheiro(3200)}
            assert u.ganhos.somar(pessoa.id, date(2026, 11, 1), date(2026, 11, 30)) == Dinheiro(0)
            assert u.destinacoes.principais(pessoa.id)[inv.id][Tag("patrimonio")] == Dinheiro(
                279012
            )
            assert u.contas.obter(pessoa.id, corrente.id).saldo == corrente.saldo
            assert u.contas.obter(pessoa.id, corretora.id).saldo == corretora.saldo

    conferir(0)
    for origem, destino, valor, esperado in (
        (corrente, corretora, 30000, 30000),
        (corretora, corrente, 40000, -10000),
    ):
        saida = importar(origem, valor, SentidoDaTransacao.SAIDA, "Transferência fictícia")
        entrada = importar(destino, valor, SentidoDaTransacao.ENTRADA, "Transferência fictícia")
        ClassificarTransferencia(uow).executar(pessoa.id, saida.id, destino.id, entrada.id)
        conferir(esperado)


def test_abatimento_e_reversao_restauram_saldo_inicial_no_banco_normalizado(fabrica_de_sessoes):
    from gastoba.domain.destinacao import Destinacao, ParteDeDestinacao
    from gastoba.domain.movimento_de_investimento import MovimentoDeInvestimento
    from gastoba.domain.portas import InvestimentoExterno
    from gastoba.domain.tag import Tag

    uow = UnidadeDeTrabalhoSqlAlchemy(fabrica_de_sessoes)
    pessoa = Usuario("Pessoa fictícia")
    conta = Conta(
        pessoa.id,
        "Corretora",
        Dinheiro(50000),
        origem=OrigemDaConta.OPEN_FINANCE,
        id_externo="corretora",
    )
    with uow as u:
        u.usuarios.garantir(pessoa)
        u.contas.adicionar(conta)
        u.investimentos.salvar_posicao(
            pessoa.id,
            InvestimentoExterno(
                "acao",
                "Ação fictícia",
                "EQUITY",
                None,
                Dinheiro(40000),
                "{}",
            ),
        )
        inv = u.investimentos.listar_posicoes(pessoa.id)[0]
        inicial = MovimentoDeInvestimento.de_saldo_inicial(
            inv.id, Dinheiro(40000), date(2026, 11, 5)
        )
        u.movimentos_de_investimento.adicionar(inicial)
        u.destinacoes.adicionar(
            inicial.id,
            [
                ParteDeDestinacao(Tag("reserva"), Dinheiro(24000)),
                ParteDeDestinacao(Tag("viagem"), Dinheiro(16000)),
            ],
        )
        t = TransacaoImportada(
            conta.id,
            "compra",
            date(2026, 11, 4),
            "Compra fictícia",
            Dinheiro(10000),
            SentidoDaTransacao.SAIDA,
        )
        u.transacoes_importadas.adicionar_se_nova(t)
        u.commit()
    AceitarTransacaoImportada(uow).executar(
        pessoa.id,
        t.id,
        None,
        [],
        como_investimento=True,
        investimento_id=inv.id,
        destinacoes=[Destinacao(Tag("patrimonio"), 100)],
    )
    with uow as u:
        saldo_abatido = u.movimentos_de_investimento.obter(pessoa.id, inicial.id)
        assert saldo_abatido.valor == Dinheiro(30000)
    previa = ConsultarImpactoDaReversao(uow).executar(pessoa.id, t.id)
    DesfazerClassificacaoImportada(uow).executar(pessoa.id, t.id, versao_esperada=previa.versao)
    with uow as u:
        restaurado = u.movimentos_de_investimento.obter(pessoa.id, inicial.id)
        assert restaurado.valor == Dinheiro(40000) and restaurado.data == inicial.data
        assert u.destinacoes.principais(pessoa.id)[inv.id] == {
            Tag("reserva"): Dinheiro(24000),
            Tag("viagem"): Dinheiro(16000),
        }
        assert u.contas.obter(pessoa.id, conta.id).saldo == conta.saldo
