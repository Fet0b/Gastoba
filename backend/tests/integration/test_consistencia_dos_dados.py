"""A revisão de consistência (frente 067): passa no banco populado e acusa cada defeito plantado.

Os defeitos são plantados numa **cópia temporária** do banco populado (sem gatilhos, sem chaves
estrangeiras e sem CHECKs, para o defeito entrar). A revisão só lê.
"""

import re
import shutil
import sqlite3
from datetime import date

import pytest

from dados_de_teste.consistencia import (
    VERIFICACOES,
    ResultadoDaVerificacao,
    abrir_somente_leitura,
    imprimir_relatorio,
    revisar,
)
from dados_de_teste.popular import EMAIL_DA_OUTRA_PESSOA, popular

HOJE = date(2026, 11, 15)
AMBIENTE = {"GASTOBA_AMBIENTE_DE_TESTE": "true"}
OUTRA = f"(SELECT id FROM usuarios WHERE email='{EMAIL_DA_OUTRA_PESSOA}')"
CONTA_DA_OUTRA = "(SELECT id FROM contas WHERE nome='Carteira da outra pessoa')"


@pytest.fixture(scope="module")
def banco_populado(tmp_path_factory):
    pasta = tmp_path_factory.mktemp("revisao")
    popular(f"sqlite:///{pasta}/teste.db", HOJE, ambiente=AMBIENTE)
    return pasta / "teste.db"


def _url(arquivo) -> str:
    return f"sqlite:///{arquivo}"


def _falhas(resultados: list[ResultadoDaVerificacao], nome: str) -> int:
    return next(r.falhas for r in resultados if r.nome == nome)


def _plantar(banco_populado, tmp_path, *comandos: str):
    copia = tmp_path / "defeituoso.db"
    shutil.copy(banco_populado, copia)
    conexao = sqlite3.connect(copia)
    conexao.execute("PRAGMA foreign_keys=OFF")
    conexao.execute("PRAGMA ignore_check_constraints=ON")
    gatilhos = conexao.execute("SELECT name FROM sqlite_master WHERE type='trigger'").fetchall()
    for (nome,) in gatilhos:
        conexao.execute(f'DROP TRIGGER "{nome}"')
    for comando in comandos:
        cursor = conexao.execute(comando)
        assert cursor.rowcount != 0, f"o defeito não alterou nada: {comando}"
    conexao.commit()
    conexao.close()
    return copia


def test_o_banco_populado_passa_em_todas_as_verificacoes(banco_populado):
    resultados = revisar(_url(banco_populado))

    assert [r.nome for r in resultados if r.reprova] == []
    # nada ficou de fora por engano: só as verificações que dependem de outra frente (063)
    assert all(r.aplica for r in resultados)
    assert len(resultados) == len(VERIFICACOES)


def test_nomes_das_verificacoes_sao_unicos_e_descritos():
    nomes = [v.nome for v in VERIFICACOES]

    assert len(nomes) == len(set(nomes))
    assert all(v.descricao and v.grupo for v in VERIFICACOES)


DEFEITOS = {
    "chaves_estrangeiras": [
        "UPDATE gastos SET conta_id='00000000000000000000000000000000' "
        "WHERE id=(SELECT id FROM gastos LIMIT 1)"
    ],
    # --- posse ---
    "posse_do_movimento": [
        f"UPDATE investimentos SET usuario_id={OUTRA} WHERE id=(SELECT investimento_id FROM "
        "movimentos_de_investimento WHERE investimento_id IS NOT NULL AND conta_id IS NOT NULL "
        "LIMIT 1)"
    ],
    "movimento_e_transacao_da_mesma_conta": [
        f"UPDATE movimentos_de_investimento SET conta_id={CONTA_DA_OUTRA} WHERE id=(SELECT id "
        "FROM movimentos_de_investimento WHERE transacao_importada_id IS NOT NULL LIMIT 1)"
    ],
    "gasto_e_transacao_da_mesma_conta": [
        f"UPDATE gastos SET conta_id={CONTA_DA_OUTRA} WHERE id=(SELECT id FROM gastos WHERE "
        "transacao_importada_id IS NOT NULL LIMIT 1)"
    ],
    "ganho_e_transacao_da_mesma_conta": [
        f"UPDATE ganhos SET conta_id={CONTA_DA_OUTRA} WHERE id=(SELECT id FROM ganhos WHERE "
        "transacao_importada_id IS NOT NULL LIMIT 1)"
    ],
    "posse_da_destinacao": [
        f"UPDATE destinacoes_cadastradas SET usuario_id={OUTRA} WHERE nome='casa'"
    ],
    "posse_da_cobertura": [
        "UPDATE coberturas_de_compra SET gasto_id=(SELECT g.id FROM gastos g JOIN contas c ON "
        "c.id=g.conta_id WHERE c.nome='Carteira da outra pessoa' LIMIT 1)"
    ],
    "posse_da_reaplicacao": [
        f"UPDATE investimentos SET usuario_id={OUTRA} WHERE id=(SELECT investimento_id FROM "
        "movimentos_de_investimento WHERE id=(SELECT aporte_id FROM reaplicacoes_de_resgates))"
    ],
    "posse_da_operacao_relacionada": [
        "UPDATE operacoes_de_investimento SET operacao_relacionada_id=(SELECT o2.id FROM "
        "operacoes_de_investimento o2 WHERE o2.posicao_id <> operacoes_de_investimento.posicao_id "
        "LIMIT 1) WHERE id=(SELECT id FROM operacoes_de_investimento LIMIT 1)"
    ],
    "posse_do_casamento": [
        f"UPDATE investimentos SET usuario_id={OUTRA} WHERE id=(SELECT posicao_id FROM "
        "operacoes_de_investimento WHERE id=(SELECT operacao_id FROM operacoes_do_casamento "
        "LIMIT 1))"
    ],
    "fatura_da_mesma_conta": [
        "UPDATE transacoes_importadas SET fatura_id=(SELECT id FROM faturas LIMIT 1) WHERE id="
        "(SELECT id FROM transacoes_importadas WHERE conta_id <> "
        "(SELECT conta_id FROM faturas LIMIT 1) LIMIT 1)"
    ],
    "posse_da_alocacao": [
        f"UPDATE destinacoes_cadastradas SET usuario_id={OUTRA} WHERE id=(SELECT destinacao_id "
        "FROM alocacoes_de_caixinha LIMIT 1)"
    ],
    "posse_da_realocacao": [
        f"UPDATE destinacoes_cadastradas SET usuario_id={OUTRA} WHERE id=(SELECT "
        "destinacao_origem_id FROM realocacoes LIMIT 1)"
    ],
    "posse_da_conta_remunerada": [
        f"UPDATE contas SET usuario_id={OUTRA} WHERE id=(SELECT conta_remunerada_id FROM "
        "investimentos WHERE conta_remunerada_id IS NOT NULL LIMIT 1)"
    ],
    "posse_da_caixinha_marcada": ["DELETE FROM preferencias_do_orcamento"],
    "posse_da_transferencia": [f"UPDATE transferencias_entre_contas SET usuario_id={OUTRA}"],
    "posse_das_tags": [
        f"UPDATE tags SET usuario_id={OUTRA} WHERE id=(SELECT tag_id FROM tags_de_gastos LIMIT 1)"
    ],
    "posse_da_reversao": [f"UPDATE reversoes_de_classificacao SET usuario_id={OUTRA}"],
    "recorrencia_da_mesma_conta": [
        f"UPDATE gastos SET conta_id={CONTA_DA_OUTRA} WHERE id=(SELECT id FROM gastos WHERE "
        "recorrencia_id IS NOT NULL LIMIT 1)"
    ],
    # --- dinheiro ---
    "saldo_da_conta_manual": [
        "UPDATE contas SET saldo_centavos=saldo_centavos+1 WHERE nome='Carteira (manual)'"
    ],
    "destinacoes_somam_o_movimento": [
        "UPDATE destinacoes SET valor_centavos=valor_centavos+1 WHERE id=(SELECT id FROM "
        "destinacoes WHERE valor_centavos>0 LIMIT 1)"
    ],
    "partes_com_o_sinal_do_movimento": [
        "UPDATE destinacoes SET valor_centavos=-valor_centavos WHERE id=(SELECT id FROM "
        "destinacoes WHERE valor_centavos>0 LIMIT 1)"
    ],
    "principal_nunca_negativo": ["UPDATE realocacoes SET valor_centavos=999999999"],
    "cobertura_dentro_do_gasto": ["UPDATE coberturas_de_compra SET valor_centavos=999999999"],
    "cobertura_dentro_do_resgate": [
        "UPDATE destinacoes SET valor_centavos=-10000 WHERE movimento_id=(SELECT movimento_id "
        "FROM coberturas_de_compra)"
    ],
    "reaplicacao_dentro_dos_limites": [
        "UPDATE reaplicacoes_de_resgates SET valor_centavos=999999999"
    ],
    "total_da_fatura_estimada": [
        "UPDATE faturas SET total_centavos=total_centavos+1 WHERE id=(SELECT id FROM faturas "
        "WHERE fonte='estimada' LIMIT 1)"
    ],
    # --- estados ---
    "aceita_tem_lancamento": [
        "UPDATE transacoes_importadas SET estado='aceita' WHERE id=(SELECT id FROM "
        "transacoes_importadas WHERE estado='pendente' LIMIT 1)"
    ],
    "pendente_ou_ignorada_sem_lancamento": [
        "UPDATE transacoes_importadas SET estado='pendente' WHERE id=(SELECT "
        "transacao_importada_id FROM gastos WHERE transacao_importada_id IS NOT NULL LIMIT 1)"
    ],
    "soma_dos_lancamentos_da_transacao": [
        "UPDATE gastos SET valor_centavos=valor_centavos+1 WHERE id=(SELECT id FROM gastos "
        "WHERE transacao_importada_id IS NOT NULL LIMIT 1)"
    ],
    "recorrencia_com_competencia_unica": [
        "UPDATE gastos SET competencia=NULL WHERE id=(SELECT id FROM gastos WHERE "
        "recorrencia_id IS NOT NULL LIMIT 1)"
    ],
    "movimento_sem_conta_so_saldo_inicial": [
        "UPDATE movimentos_de_investimento SET conta_id=NULL WHERE id=(SELECT id FROM "
        "movimentos_de_investimento WHERE origem='open_finance' LIMIT 1)"
    ],
    "recorrencia_com_categoria_coerente": [
        "UPDATE recorrencias SET categoria=NULL WHERE tipo='gasto'"
    ],
    "conta_importada_com_id_externo": [
        "UPDATE contas SET id_externo=NULL WHERE id=(SELECT id FROM contas WHERE "
        "origem='open_finance' LIMIT 1)"
    ],
    "casamento_completo": [
        "DELETE FROM vinculos_de_casamento WHERE casamento_id=(SELECT id FROM "
        "casamentos_de_operacao LIMIT 1)"
    ],
    "transferencia_ativa_com_pontas_aceitas": [
        "UPDATE transacoes_importadas SET estado='pendente' WHERE id=(SELECT "
        "transacao_origem_id FROM transferencias_entre_contas)"
    ],
    # --- caixa sem resíduos (069) ---
    "pendente_sem_vestigio": [
        "INSERT INTO vinculos_de_casamento (casamento_id, transacao_importada_id, papel) "
        "SELECT (SELECT id FROM casamentos_de_operacao LIMIT 1), "
        "(SELECT id FROM transacoes_importadas WHERE estado='pendente' LIMIT 1), 'taxa'"
    ],
    "ligada_sem_gasto_nem_ganho": [
        "INSERT INTO gastos (id, conta_id, descricao, valor_centavos, data, categoria, origem, "
        "transacao_importada_id) SELECT lower(hex(randomblob(16))), t.conta_id, 'x', 1, t.data, "
        "'lazer', 'open_finance', t.id FROM transacoes_importadas t WHERE t.id IN "
        "(SELECT transacao_importada_id FROM vinculos_de_casamento) LIMIT 1"
    ],
    "movimentos_da_ligacao_por_operacao": [
        "INSERT INTO movimentos_de_investimento (id, conta_id, investimento_id, tipo, descricao, "
        "valor_centavos, data, origem, transacao_importada_id, revisao_contabil_pendente, "
        "revisao_pendente, vencimento_confirmado) SELECT lower(hex(randomblob(16))), t.conta_id, "
        "(SELECT id FROM investimentos LIMIT 1), 'aporte', 'x', 1, t.data, 'open_finance', t.id, "
        "0, 0, 0 FROM transacoes_importadas t WHERE t.id IN (SELECT transacao_importada_id "
        "FROM vinculos_de_casamento WHERE papel='bruto') LIMIT 1"
    ],
    "liquidacao_de_bolsa_sem_gasto_novo": [
        "INSERT INTO gastos (id, conta_id, descricao, valor_centavos, data, categoria, origem, "
        "transacao_importada_id) SELECT lower(hex(randomblob(16))), t.conta_id, 'x', 1, t.data, "
        "'lazer', 'open_finance', t.id FROM transacoes_importadas t "
        "WHERE lower(t.descricao) LIKE 'liq bolsa%' LIMIT 1"
    ],
    "vencimento_confirmado_com_posicao": [
        "UPDATE movimentos_de_investimento SET vencimento_confirmado=1, investimento_id=NULL "
        "WHERE id=(SELECT id FROM movimentos_de_investimento WHERE tipo='aporte' LIMIT 1)"
    ],
    "saldo_da_conta_importada_do_cenario": [
        "UPDATE contas SET saldo_centavos=saldo_centavos+1 WHERE origem='open_finance'"
    ],
    "metas_ate_100": ["UPDATE metas SET percentual=100"],
    "transferencia_coerente": [
        "UPDATE transferencias_entre_contas SET valor_centavos=valor_centavos+1"
    ],
    "reaplicacao_coerente": [
        "INSERT INTO reaplicacoes_de_resgates (id, resgate_id, aporte_id, valor_centavos) "
        "SELECT lower(hex(randomblob(16))), id, id, 1 FROM movimentos_de_investimento "
        "WHERE tipo='aporte' LIMIT 1"
    ],
    "compra_no_ciclo_da_fatura": [
        "UPDATE transacoes_importadas SET data='1999-01-01' WHERE id=(SELECT id FROM "
        "transacoes_importadas WHERE fatura_id IS NOT NULL LIMIT 1)"
    ],
    # --- catálogos ---
    "catalogo_de_categorias": [
        "UPDATE gastos SET categoria='viagens' WHERE id=(SELECT id FROM gastos LIMIT 1)"
    ],
    "catalogo_de_contas": ["UPDATE contas SET tipo='poupanca' WHERE nome='Carteira (manual)'"],
    "catalogo_de_lancamentos": [
        "UPDATE transacoes_importadas SET sentido='lado' WHERE id=(SELECT id FROM "
        "transacoes_importadas LIMIT 1)"
    ],
    "catalogo_de_investimentos": [
        "UPDATE movimentos_de_investimento SET tipo='doacao' WHERE id=(SELECT id FROM "
        "movimentos_de_investimento LIMIT 1)"
    ],
    "catalogo_de_aparencia_e_cores": ["UPDATE aparencias SET textura='listras'"],
    # --- frentes novas (065 e 066) ---
    "espelho_nunca_pendente_nem_aceito": [
        "UPDATE transacoes_importadas SET estado='pendente', motivo_ignorada=NULL WHERE id=("
        "SELECT id FROM transacoes_importadas "
        "WHERE motivo_ignorada='movimento_interno_da_conta' LIMIT 1)"
    ],
    "espelho_sem_lancamento": [
        "UPDATE ganhos SET transacao_importada_id=(SELECT id FROM transacoes_importadas "
        "WHERE motivo_ignorada='movimento_interno_da_conta' LIMIT 1) WHERE id=("
        "SELECT id FROM ganhos WHERE transacao_importada_id IS NOT NULL LIMIT 1)"
    ],
    "aparencia_valida": ["UPDATE aparencias SET matiz=360"],
    "caixinha_marcada_em_categoria_ativa": [
        "UPDATE caixinhas_marcadas SET categoria='investimentos'"
    ],
    "guardado_nas_metas_valido": ["UPDATE preferencias_do_orcamento SET guardado_nas_metas=5"],
    "final_da_conta_com_quatro_digitos": [
        "UPDATE contas SET final_do_numero='12a' WHERE final_do_numero IS NOT NULL"
    ],
    "apelido_unico_por_pessoa": [
        "DROP INDEX uq_contas_usuario_id_apelido",
        "UPDATE contas SET apelido='Conta da casa' WHERE nome LIKE 'Banco Exemplo Conta c%'",
    ],
    "conta_manual_sem_dados_do_banco": [
        "UPDATE contas SET nome_no_banco='Carteira', final_do_numero='1234' "
        "WHERE id=(SELECT id FROM contas WHERE origem='manual' LIMIT 1)"
    ],
}


def test_todo_defeito_plantado_tem_verificacao_e_toda_verificacao_tem_defeito():
    sem_defeito = {v.nome for v in VERIFICACOES} - set(DEFEITOS) - {"integridade_do_sqlite"}
    sem_verificacao = set(DEFEITOS) - {v.nome for v in VERIFICACOES}

    assert sem_defeito == {"esquema_na_cabeca_do_alembic"}  # testado à parte, logo abaixo
    assert not sem_verificacao


@pytest.mark.parametrize("nome", sorted(DEFEITOS))
def test_defeito_plantado_faz_a_verificacao_certa_falhar(nome, banco_populado, tmp_path):
    copia = _plantar(banco_populado, tmp_path, *DEFEITOS[nome])

    resultados = revisar(_url(copia))

    assert _falhas(resultados, nome) >= 1


# Defeitos que o banco, com gatilhos, CHECKs e chaves estrangeiras ligados, não recusa: só a
# revisão os acusa (regra de negócio entre linhas, sem restrição no esquema).
EXCECOES_QUE_O_BANCO_NAO_COBRE: set[str] = {
    "apelido_unico_por_pessoa",  # o defeito só entra sem o índice único
    "conta_manual_sem_dados_do_banco",
    "espelho_nunca_pendente_nem_aceito",
    "saldo_da_conta_importada_do_cenario",
    "aceita_tem_lancamento",
    "caixinha_marcada_em_categoria_ativa",
    "casamento_completo",
    "catalogo_de_aparencia_e_cores",
    "catalogo_de_categorias",
    "catalogo_de_contas",
    "cobertura_dentro_do_gasto",
    "cobertura_dentro_do_resgate",
    "compra_no_ciclo_da_fatura",
    "destinacoes_somam_o_movimento",
    "guardado_nas_metas_valido",
    "ligada_sem_gasto_nem_ganho",
    "liquidacao_de_bolsa_sem_gasto_novo",
    "metas_ate_100",
    "movimentos_da_ligacao_por_operacao",
    "partes_com_o_sinal_do_movimento",
    "pendente_ou_ignorada_sem_lancamento",
    "pendente_sem_vestigio",
    "posse_da_caixinha_marcada",
    "posse_da_operacao_relacionada",
    "principal_nunca_negativo",
    "reaplicacao_coerente",
    "reaplicacao_dentro_dos_limites",
    "recorrencia_com_competencia_unica",
    "saldo_da_conta_manual",
    "soma_dos_lancamentos_da_transacao",
    "total_da_fatura_estimada",
    "transferencia_ativa_com_pontas_aceitas",
}


@pytest.mark.parametrize("nome", sorted(DEFEITOS))
def test_o_banco_com_as_restricoes_ligadas_recusa_o_mesmo_defeito(nome, banco_populado, tmp_path):
    copia = tmp_path / "protegido.db"
    shutil.copy(banco_populado, copia)
    conexao = sqlite3.connect(copia)
    conexao.execute("PRAGMA foreign_keys=ON")
    recusado = False
    try:
        for comando in DEFEITOS[nome]:
            try:
                conexao.execute(comando)
            except sqlite3.DatabaseError:
                recusado = True
                break
        conexao.commit()
    finally:
        conexao.close()
    if nome in EXCECOES_QUE_O_BANCO_NAO_COBRE:
        assert not recusado, f"{nome} agora é recusado pelo banco: tire da lista de exceções"
    else:
        assert recusado, f"o banco aceitou o defeito {nome}: acrescente à lista de exceções"


def test_a_contagem_da_falha_e_a_dos_casos_defeituosos(banco_populado, tmp_path):
    copia = _plantar(
        banco_populado,
        tmp_path,
        "UPDATE gastos SET categoria='viagens' WHERE id IN (SELECT id FROM gastos LIMIT 3)",
    )

    assert _falhas(revisar(_url(copia)), "catalogo_de_categorias") == 3


def test_esquema_atras_da_cabeca_do_alembic_e_acusado_e_a_revisao_para(banco_populado, tmp_path):
    copia = _plantar(
        banco_populado, tmp_path, "UPDATE alembic_version SET version_num='ab2e8cee8c19'"
    )

    resultados = revisar(_url(copia))

    assert _falhas(resultados, "esquema_na_cabeca_do_alembic") == 1
    # para: só a estrutura foi conferida
    assert {r.nome for r in resultados} <= {
        "integridade_do_sqlite",
        "chaves_estrangeiras",
        "esquema_na_cabeca_do_alembic",
    }


def test_tabela_inexistente_vira_nao_se_aplica(banco_populado, tmp_path):
    copia = _plantar(banco_populado, tmp_path, "DROP TABLE caixinhas_marcadas")

    resultados = revisar(_url(copia))

    marcada = next(r for r in resultados if r.nome == "caixinha_marcada_em_categoria_ativa")
    assert not marcada.aplica and marcada.falhas == 0


def test_saldo_da_conta_manual_nao_se_aplica_fora_do_cenario(banco_populado, tmp_path):
    copia = _plantar(
        banco_populado, tmp_path, "UPDATE contas SET nome='Outra carteira' WHERE origem='manual'"
    )

    resultados = revisar(_url(copia))

    saldo = next(r for r in resultados if r.nome == "saldo_da_conta_manual")
    assert not saldo.aplica


def test_a_revisao_abre_somente_leitura(banco_populado):
    conexao = abrir_somente_leitura(_url(banco_populado))
    try:
        with pytest.raises(sqlite3.OperationalError):
            conexao.execute("DELETE FROM gastos")
        with pytest.raises(sqlite3.OperationalError):
            conexao.execute("CREATE TABLE intruso (x INTEGER)")
    finally:
        conexao.close()


def test_revisar_nao_altera_o_arquivo(banco_populado, tmp_path):
    copia = tmp_path / "copia.db"
    shutil.copy(banco_populado, copia)
    antes = copia.read_bytes()

    revisar(_url(copia))

    assert copia.read_bytes() == antes


def test_banco_inexistente_nao_e_criado_pela_revisao(tmp_path):
    arquivo = tmp_path / "nao-existe.db"

    with pytest.raises(FileNotFoundError):
        revisar(_url(arquivo))

    assert not arquivo.exists()


def test_o_relatorio_nao_traz_valores_nomes_nem_ids(banco_populado, tmp_path, capsys):
    copia = _plantar(banco_populado, tmp_path, *DEFEITOS["posse_da_destinacao"])
    resultados = revisar(_url(copia))

    imprimir_relatorio(resultados)
    texto = capsys.readouterr().out

    assert "posse_da_destinacao" in texto
    for proibido in ("exemplo.com", "Carteira", "Banco Exemplo", "senha"):
        assert proibido not in texto
    assert not re.search(r"\bcasa\b", texto)  # o nome de uma caixinha do cenário
    assert not re.search(r"[0-9a-f]{32}", texto)
    assert not re.search(r"\d{4}-\d{2}-\d{2}", texto)


# --- a linha de comando ---


def test_comando_revisar_sai_com_zero_quando_passa_e_com_um_quando_falha(
    banco_populado, tmp_path, capsys
):
    from dados_de_teste.__main__ import main

    assert main(["revisar", "--url-banco", _url(banco_populado)]) == 0
    assert "0 com falha" in capsys.readouterr().out

    copia = _plantar(banco_populado, tmp_path, *DEFEITOS["catalogo_de_categorias"])
    assert main(["revisar", "--url-banco", _url(copia)]) == 1
    assert "FALHA" in capsys.readouterr().out


def test_comando_popular_recusa_sem_a_variavel_e_popula_com_ela(tmp_path, monkeypatch, capsys):
    from dados_de_teste.__main__ import main

    url = _url(tmp_path / "cli.db")
    monkeypatch.delenv("GASTOBA_AMBIENTE_DE_TESTE", raising=False)
    assert main(["popular", "--url-banco", url, "--hoje", "2026-11-15"]) == 2
    assert "Recusado" in capsys.readouterr().err

    monkeypatch.setenv("GASTOBA_AMBIENTE_DE_TESTE", "true")
    assert main(["popular", "--url-banco", url, "--hoje", "2026-11-15"]) == 0
    saida = capsys.readouterr().out
    assert "teste@exemplo.com" in saida and "usuarios: 2" in saida
    assert main(["popular", "--url-banco", url, "--se-vazio"]) == 0
    assert "nada foi escrito" in capsys.readouterr().out
    assert main(["popular", "--url-banco", url]) == 2


def test_aviso_aparece_no_relatorio_mas_nao_reprova_a_revisao(banco_populado, tmp_path, capsys):
    """D7: gasto antigo de liquidação da bolsa é aviso, não defeito."""
    copia = _plantar(banco_populado, tmp_path, *DEFEITOS["liquidacao_de_bolsa_sem_gasto_novo"])
    resultados = revisar(_url(copia))
    aviso = next(r for r in resultados if r.nome == "liquidacao_de_bolsa_sem_gasto_novo")
    assert aviso.nivel == "aviso" and aviso.falhas >= 1 and not aviso.reprova
    # O gasto plantado cai numa transação já ligada, então essa outra verificação também acusa.
    assert [r.nome for r in resultados if r.reprova] == ["ligada_sem_gasto_nem_ganho"]
    imprimir_relatorio(resultados)
    assert "[AVISO] liquidacao_de_bolsa_sem_gasto_novo" in capsys.readouterr().out


def test_espelho_do_banco_populado_esta_ignorado_com_o_motivo_e_sem_lancamento(banco_populado):
    resultados = revisar(_url(banco_populado))

    assert _falhas(resultados, "espelho_nunca_pendente_nem_aceito") == 0
    assert _falhas(resultados, "espelho_sem_lancamento") == 0
    conexao = sqlite3.connect(banco_populado)
    try:
        ignorados = conexao.execute(
            "SELECT COUNT(*) FROM transacoes_importadas "
            "WHERE motivo_ignorada='movimento_interno_da_conta'"
        ).fetchone()[0]
    finally:
        conexao.close()
    assert ignorados >= 4  # dois pares de aplicação e resgate automáticos, mais a emissão ao lado


def test_aporte_excluido_logicamente_nao_e_residuo_da_transacao_ignorada(banco_populado, tmp_path):
    # Um aporte que é o único lançamento da transação de origem.
    sozinho = (
        "SELECT m.id, m.transacao_importada_id FROM movimentos_de_investimento m "
        "WHERE m.transacao_importada_id IS NOT NULL "
        "AND (SELECT COUNT(*) FROM movimentos_de_investimento y "
        "WHERE y.transacao_importada_id = m.transacao_importada_id) = 1 "
        "AND NOT EXISTS (SELECT 1 FROM gastos g WHERE g.transacao_importada_id = "
        "m.transacao_importada_id) "
        "AND NOT EXISTS (SELECT 1 FROM ganhos g WHERE g.transacao_importada_id = "
        "m.transacao_importada_id) LIMIT 1"
    )
    ligar = (
        "UPDATE transacoes_importadas SET estado='ignorada', "
        "motivo_ignorada='movimento_interno_da_conta' "
        f"WHERE id=(SELECT transacao_importada_id FROM ({sozinho}))"
    )
    excluir = (
        "INSERT INTO tratamentos_de_aporte (id, movimento_id, acao, valores_originais, "
        f"criado_em, aprovado_em) SELECT hex(randomblob(16)), id, 'excluido', '{{}}', "
        f"'2026-11-01', '2026-11-02' FROM ({sozinho})"
    )
    (tmp_path / "a").mkdir()
    (tmp_path / "b").mkdir()
    sem_tratamento = _plantar(banco_populado, tmp_path / "a", ligar)
    com_tratamento = _plantar(banco_populado, tmp_path / "b", ligar, excluir)

    nome = "pendente_ou_ignorada_sem_lancamento"
    assert _falhas(revisar(_url(sem_tratamento)), nome) >= 1
    assert _falhas(revisar(_url(com_tratamento)), nome) == 0
