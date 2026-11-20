"""O ambiente de teste (frente 067): a Pluggy de mentira, o roteiro de popular e as guardas.

Tudo com SQLite temporário e dados fictícios; nenhuma chamada de rede.
"""

import json
import re
from datetime import date, timedelta

import httpx
import pytest
from sqlalchemy import create_engine, text

from dados_de_teste.datas import deslocar
from dados_de_teste.popular import (
    EMAIL_DA_DONA,
    EMAIL_DA_OUTRA_PESSOA,
    PopulacaoRecusada,
    RelogioFixo,
    aplicar_migrations,
    popular,
    verificar_guardas_de_ambiente,
)
from dados_de_teste.transporte_simulado import (
    CHAVE_FICTICIA,
    ITEM_DO_CENARIO,
    PASTA_DO_CENARIO,
    PluggyDeMentira,
    criar_cliente_simulado,
)
from gastoba.application.cadastrar_usuario import CadastrarUsuario
from gastoba.application.sincronizar_contas_bancarias import SincronizarContasBancarias
from gastoba.infrastructure.persistencia.banco import criar_engine, criar_fabrica_de_sessoes
from gastoba.infrastructure.persistencia.unidade_de_trabalho import UnidadeDeTrabalhoSqlAlchemy
from gastoba.infrastructure.pluggy.provedor_pluggy import ProvedorPluggy
from gastoba.infrastructure.seguranca.hasher_de_senha_scrypt import HasherDeSenhaScrypt

HOJE = date(2026, 11, 15)


def _provedor(hoje: date = HOJE) -> ProvedorPluggy:
    return ProvedorPluggy("id-ficticio", "segredo-ficticio", cliente=criar_cliente_simulado(hoje))


# --- datas relativas ---


def test_deslocar_resolve_os_dias_atras_e_no_futuro():
    bruto = {
        "a": {"_datas": {"date": 3, "dueDate": -2}, "x": 1},
        "lista": [{"_datas": {"date": 0}}],
    }

    assert deslocar(bruto, HOJE) == {
        "a": {"x": 1, "date": "2026-11-12T00:00:00.000Z", "dueDate": "2026-11-17T00:00:00.000Z"},
        "lista": [{"date": "2026-11-15T00:00:00.000Z"}],
    }


def test_deslocar_troca_o_marcador_de_pregao_em_texto():
    assert deslocar("LIQ BOLSA PREGAO: {hoje-20}", HOJE) == "LIQ BOLSA PREGAO: 26/10/2026"


def test_deslocar_nao_altera_o_original():
    bruto = {"_datas": {"date": 1}}

    deslocar(bruto, HOJE)

    assert bruto == {"_datas": {"date": 1}}


# --- transporte simulado, lido pelo adaptador real ---


def test_o_adaptador_le_as_contas_do_cenario_e_descarta_a_conta_em_dolar():
    contas = _provedor().listar_contas(ITEM_DO_CENARIO)

    nomes = sorted(c.nome for c in contas)
    assert nomes == [
        "Banco Exemplo Cartão Black",
        "Banco Exemplo Conta corrente",
        "Banco Exemplo Conta remunerada",
        "Banco Exemplo Segunda conta",
        "Banco Exemplo Segunda conta",
    ]
    # Duas contas do mesmo banco: uma com número (só os quatro últimos dígitos) e outra sem.
    segundas = [c for c in contas if c.nome.endswith("Segunda conta")]
    assert sorted(str(c.final_do_numero) for c in segundas) == ["3333", "None"]
    corrente = next(c for c in contas if c.nome.endswith("Conta corrente"))
    assert corrente.final_do_numero == "0000"  # "0001/00000-0": os quatro últimos dígitos
    cartao = next(c for c in contas if "Cartão" in c.nome)
    assert cartao.saldo.centavos < 0  # a dívida do cartão é saldo negativo


def test_item_desconhecido_nao_tem_contas_nem_investimentos():
    provedor = _provedor()

    assert provedor.listar_contas("outro-item") == []
    assert provedor.listar_investimentos("outro-item") == []


def test_transacoes_chegam_paginadas_por_cursor_e_so_as_postadas_em_reais():
    provedor = _provedor()

    transacoes = provedor.listar_transacoes("conta-corrente-exemplo", HOJE - timedelta(days=400))

    arquivo = PASTA_DO_CENARIO / "transactions" / "conta-corrente-exemplo.json"
    bruto = json.loads(arquivo.read_text(encoding="utf-8"))["results"]
    assert len(bruto) > 25  # mais de uma página
    esperadas = [t for t in bruto if t["status"] == "POSTED" and t["currencyCode"] == "BRL"]
    assert len(transacoes) == len(esperadas)
    assert len({t.id_externo for t in transacoes}) == len(transacoes)


def test_data_de_corte_filtra_as_transacoes_mais_antigas():
    provedor = _provedor()

    todas = provedor.listar_transacoes("conta-corrente-exemplo", HOJE - timedelta(days=400))
    recentes = provedor.listar_transacoes("conta-corrente-exemplo", HOJE - timedelta(days=10))

    assert 0 < len(recentes) < len(todas)
    assert all(t.data >= HOJE - timedelta(days=10) for t in recentes)


def test_investimentos_e_operacoes_do_cenario():
    provedor = _provedor()

    investimentos = provedor.listar_investimentos(ITEM_DO_CENARIO)

    assert len(investimentos) == 12
    sem_subtipo = [i for i in investimentos if i.subtipo is None]
    assert len(sem_subtipo) == 1
    assert any(i.saldo.centavos == 0 for i in investimentos)  # título vencido
    operacoes = provedor.listar_operacoes_do_investimento("inv-cdb-vencido")
    assert sorted(o.tipo for o in operacoes) == ["SELL", "TRANSFER"]
    venda = next(o for o in operacoes if o.tipo == "SELL")
    assert venda.custos is not None and venda.custos.centavos == 3812  # o IRRF do resgate
    assert provedor.listar_operacoes_do_investimento("inv-que-nao-existe") == []


def test_operacoes_sao_paginadas_por_page():
    servidor = PluggyDeMentira(HOJE)
    cliente = httpx.Client(transport=httpx.MockTransport(servidor))
    resposta = cliente.get(
        "https://api.pluggy.ai/investments/inv-cdb-pos/transactions",
        params={"page": 1, "pageSize": 1},
        headers={"X-API-KEY": CHAVE_FICTICIA},
    )

    corpo = resposta.json()
    assert corpo["totalPages"] >= 1 and corpo["page"] == 1


def test_sem_chave_e_rota_desconhecida_respondem_erro():
    servidor = PluggyDeMentira(HOJE)
    cliente = httpx.Client(transport=httpx.MockTransport(servidor))

    assert cliente.get("https://api.pluggy.ai/accounts").status_code == 401
    desconhecida = cliente.get(
        "https://api.pluggy.ai/nao-existe", headers={"X-API-KEY": CHAVE_FICTICIA}
    )
    assert desconhecida.status_code == 404


def test_faturas_so_pelo_diagnostico_bruto():
    provedor = _provedor()

    bruto = provedor.obter_bruto("/bills", {"accountId": "cartao-exemplo"})

    assert len(bruto["results"]) == 2


def test_nome_de_arquivo_nao_sai_da_pasta_do_cenario():
    servidor = PluggyDeMentira(HOJE)
    cliente = httpx.Client(transport=httpx.MockTransport(servidor))

    resposta = cliente.get(
        "https://api.pluggy.ai/bills",
        params={"accountId": "../accounts"},
        headers={"X-API-KEY": CHAVE_FICTICIA},
    )

    assert resposta.json()["results"] == []


def test_os_arquivos_do_cenario_nao_trazem_dado_real():
    """Nomes de instituição são fictícios e não há e-mail, CPF nem telefone nos arquivos."""
    texto = " ".join(a.read_text(encoding="utf-8") for a in PASTA_DO_CENARIO.rglob("*.json"))

    assert not re.search(r"[\w.]+@[\w.]+\.\w+", texto)
    assert not re.search(r"\d{3}\.\d{3}\.\d{3}-\d{2}", texto)
    assert "Banco Exemplo" in texto


# --- guardas do roteiro de popular (nada é escrito quando uma recusa) ---

AMBIENTE_DE_TESTE = {"GASTOBA_AMBIENTE_DE_TESTE": "true"}
# Tabelas que o cenário deixa vazias de propósito: sessões nascem no login, e o tratamento de
# aportes sem investimento é uma operação do dono sobre dado legado.
TABELAS_QUE_PODEM_FICAR_VAZIAS = {"sessoes", "tratamentos_de_aporte"}


def test_recusa_sem_a_variavel_de_ambiente_de_teste_e_nao_cria_o_arquivo(tmp_path):
    arquivo = tmp_path / "teste.db"

    with pytest.raises(PopulacaoRecusada, match="GASTOBA_AMBIENTE_DE_TESTE"):
        popular(f"sqlite:///{arquivo}", HOJE, ambiente={})

    assert not arquivo.exists()


def test_recusa_variavel_com_outro_valor(tmp_path):
    with pytest.raises(PopulacaoRecusada):
        popular(f"sqlite:///{tmp_path}/t.db", HOJE, ambiente={"GASTOBA_AMBIENTE_DE_TESTE": "1"})


@pytest.mark.parametrize("url", ["sqlite:///:memory:", "sqlite://", "postgresql://u@h/banco"])
def test_recusa_banco_que_nao_e_sqlite_em_arquivo(url):
    with pytest.raises(PopulacaoRecusada, match="SQLite em arquivo"):
        verificar_guardas_de_ambiente(url, AMBIENTE_DE_TESTE)


@pytest.mark.parametrize(
    "url",
    [
        "sqlite:////home/alguem/projeto/gastobs.db",
        "sqlite:////dados/gastobs.db",
        "sqlite:////dados/qualquer.db",
    ],
)
def test_recusa_o_caminho_de_desenvolvimento_e_o_de_producao(url):
    with pytest.raises(PopulacaoRecusada, match="desenvolvimento ou de produção"):
        verificar_guardas_de_ambiente(url, AMBIENTE_DE_TESTE)


def test_aceita_o_volume_de_teste_e_diretorio_temporario(tmp_path):
    verificar_guardas_de_ambiente("sqlite:////dados-de-teste/gastoba-teste.db", AMBIENTE_DE_TESTE)
    verificar_guardas_de_ambiente(f"sqlite:///{tmp_path}/gastobs.db", AMBIENTE_DE_TESTE)


def _contagens(url: str) -> dict[str, int]:
    engine = create_engine(url)
    try:
        with engine.connect() as conexao:
            tabelas = [
                r[0]
                for r in conexao.execute(
                    text(
                        "SELECT name FROM sqlite_master WHERE type='table' "
                        "AND name NOT LIKE 'sqlite_%' AND name <> 'alembic_version' ORDER BY name"
                    )
                )
            ]
            return {
                t: conexao.execute(text(f'SELECT COUNT(*) FROM "{t}"')).scalar_one()
                for t in tabelas
            }
    finally:
        engine.dispose()


def test_recusa_banco_que_ja_tem_usuario_sem_escrever_nada(tmp_path):
    url = f"sqlite:///{tmp_path}/existente.db"
    aplicar_migrations(url)
    engine = criar_engine(url)
    CadastrarUsuario(
        UnidadeDeTrabalhoSqlAlchemy(criar_fabrica_de_sessoes(engine)),
        HasherDeSenhaScrypt(n=2, r=1, p=1),
        cadastro_aberto=True,
    ).executar("Alguém", "alguem@exemplo.com", "senha-qualquer-1")
    engine.dispose()
    antes = _contagens(url)

    with pytest.raises(PopulacaoRecusada, match="já tem usuários"):
        popular(url, HOJE, ambiente=AMBIENTE_DE_TESTE)

    assert _contagens(url) == antes


# --- o cenário populado ---


@pytest.fixture(scope="module")
def banco_populado(tmp_path_factory):
    url = f"sqlite:///{tmp_path_factory.mktemp('populado')}/teste.db"
    resultado = popular(url, HOJE, ambiente=AMBIENTE_DE_TESTE)
    assert resultado.populou
    return url, resultado.contagens


def _consulta(url: str, sql: str, **parametros):
    engine = create_engine(url)
    try:
        with engine.connect() as conexao:
            return conexao.execute(text(sql), parametros).all()
    finally:
        engine.dispose()


def test_toda_tabela_de_negocio_tem_linhas(banco_populado):
    _, contagens = banco_populado

    vazias = {t for t, n in contagens.items() if n == 0} - TABELAS_QUE_PODEM_FICAR_VAZIAS

    assert not vazias


def test_popular_dois_bancos_do_zero_da_as_mesmas_contagens(banco_populado, tmp_path):
    _, contagens = banco_populado

    outro = popular(f"sqlite:///{tmp_path}/outro.db", HOJE, ambiente=AMBIENTE_DE_TESTE)

    assert outro.contagens == contagens


def test_popular_de_novo_recusa_e_com_se_vazio_nao_escreve(banco_populado):
    url, contagens = banco_populado

    with pytest.raises(PopulacaoRecusada, match="apague o banco de teste"):
        popular(url, HOJE, ambiente=AMBIENTE_DE_TESTE)
    de_novo = popular(url, HOJE, ambiente=AMBIENTE_DE_TESTE, se_vazio=True)

    assert not de_novo.populou
    assert _contagens(url) == contagens


def test_sincronizar_de_novo_sobre_os_mesmos_arquivos_nao_cria_nada(banco_populado):
    url, _ = banco_populado
    antes = _contagens(url)
    engine = criar_engine(url)
    try:
        provedor = ProvedorPluggy(
            "id-ficticio", "segredo-ficticio", cliente=criar_cliente_simulado(HOJE)
        )
        resultado = SincronizarContasBancarias(
            UnidadeDeTrabalhoSqlAlchemy(criar_fabrica_de_sessoes(engine)),
            provedor,
            RelogioFixo(HOJE),
            (ITEM_DO_CENARIO,),
            EMAIL_DA_DONA,
            130,
        ).executar()
    finally:
        engine.dispose()

    assert resultado.novas == 0 and resultado.falhas == 0
    for tabela in ("contas", "transacoes_importadas", "investimentos", "operacoes_de_investimento"):
        assert _contagens(url)[tabela] == antes[tabela]


def test_os_casos_dificeis_aparecem_nos_dados(banco_populado):
    url, contagens = banco_populado

    def total(sql: str) -> int:
        return _consulta(url, sql)[0][0]

    # estorno, pagamento de fatura e transferência própria vindos do banco
    assert total("SELECT COUNT(*) FROM transacoes_importadas WHERE tipo_de_operacao='ESTORNO'") > 0
    assert (
        total(
            "SELECT COUNT(*) FROM transacoes_importadas "
            "WHERE tipo_de_operacao='PAGAMENTO_FATURA' AND estado='ignorada'"
        )
        > 0
    )
    assert (
        total(
            "SELECT COUNT(*) FROM transacoes_importadas "
            "WHERE tipo_de_operacao='TRANSFERENCIA_MESMA_INSTITUICAO' AND estado='ignorada'"
        )
        > 0
    )
    # parcela do cartão, dentro do cartão
    assert total("SELECT COUNT(*) FROM transacoes_importadas WHERE descricao LIKE '%PARC 2/6%'") > 0
    # liquidação de bolsa com taxas, ligada às operações (um casamento liga mais de uma)
    assert contagens["casamentos_de_operacao"] >= 3
    assert contagens["operacoes_do_casamento"] > contagens["casamentos_de_operacao"]
    # resgate de renda fixa com imposto
    assert total("SELECT COUNT(*) FROM operacoes_de_investimento WHERE custos_centavos=3812") > 0
    # título vencido (saldo zero), fundo sem subtipo e conta remunerada
    assert total("SELECT COUNT(*) FROM investimentos WHERE saldo_centavos=0") == 1
    assert total("SELECT COUNT(*) FROM investimentos WHERE subtipo IS NULL") >= 1
    assert total("SELECT COUNT(*) FROM contas WHERE tipo='remunerada'") == 1
    # transferência classificada, reaplicação, cobertura de compra por resgate
    assert contagens["transferencias_entre_contas"] == 1
    assert contagens["reaplicacoes_de_resgates"] == 1
    assert contagens["coberturas_de_compra"] == 1
    # uma proposta da revisão da bolsa fica por escolher: as transações continuam pendentes
    assert (
        total(
            "SELECT COUNT(*) FROM transacoes_importadas "
            "WHERE estado='pendente' AND descricao LIKE 'LIQ BOLSA%BRUTO%'"
        )
        == 1
    )
    # a caixa nunca fica vazia, e a PENDING e a conta em dólar não entraram
    assert total("SELECT COUNT(*) FROM transacoes_importadas WHERE estado='pendente'") > 5
    assert total("SELECT COUNT(*) FROM transacoes_importadas WHERE descricao LIKE '%USD%'") == 0
    assert total("SELECT COUNT(*) FROM contas WHERE nome LIKE '%dólar%'") == 0


def test_a_outra_pessoa_tem_dados_proprios(banco_populado):
    url, _ = banco_populado

    contas = _consulta(
        url,
        "SELECT COUNT(*) FROM contas c JOIN usuarios u ON u.id = c.usuario_id WHERE u.email=:e",
        e=EMAIL_DA_OUTRA_PESSOA,
    )[0][0]
    metas = _consulta(
        url,
        "SELECT COUNT(*) FROM metas m JOIN usuarios u ON u.id = m.usuario_id WHERE u.email=:e",
        e=EMAIL_DA_OUTRA_PESSOA,
    )[0][0]

    assert contas == 1 and metas == 1


def test_o_cenario_traz_as_configuracoes_das_frentes_implementadas(banco_populado):
    _, contagens = banco_populado

    assert contagens["aparencias"] == 1  # 065
    assert contagens["caixinhas_marcadas"] >= 1  # 066
    assert contagens["preferencias_do_orcamento"] == 1


def test_resgate_com_caixinha_abate_o_principal_por_custo_medio_ao_centavo(banco_populado):
    """069 (T031): com um dia de histórico antes do resgate, o principal abatido é
    principal x parte / valor da tag (saldo anterior rateado pelo principal), truncado."""
    url, _ = banco_populado
    (linha,) = _consulta(
        url,
        """SELECT d.valor_centavos, d.principal_centavos, i.saldo_centavos
           FROM destinacoes d JOIN movimentos_de_investimento m ON m.id = d.movimento_id
           JOIN investimentos i ON i.id = m.investimento_id
           WHERE m.tipo = 'resgate' AND i.id_externo = 'inv-multimercado'""",
    )
    parte, abatido, saldo = -linha[0], -linha[1], linha[2]
    principal = 700000  # R$ 7.000,00 aplicados e repartidos 100% em "viagem"
    assert abatido == principal * parte // saldo
    assert abatido != parte  # prova de que o custo médio valeu, e não o dinheiro resgatado
