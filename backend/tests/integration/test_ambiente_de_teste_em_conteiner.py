"""Guardas estáticas do ambiente de teste em contêiner (frente 067).

Não dependem do Docker: conferem os arquivos. A subida de verdade é conferida à mão e registrada
no plano.
"""

import re
from pathlib import Path

RAIZ_DO_REPOSITORIO = Path(__file__).resolve().parents[3]
COMPOSE_DE_TESTE = (RAIZ_DO_REPOSITORIO / "compose.teste.yaml").read_text(encoding="utf-8")
DOCKERFILE_DE_PRODUCAO = (RAIZ_DO_REPOSITORIO / "backend" / "Dockerfile").read_text(
    encoding="utf-8"
)
DOCKERFILE_DE_TESTE = (RAIZ_DO_REPOSITORIO / "backend" / "Dockerfile.teste").read_text(
    encoding="utf-8"
)


def _sem_comentarios(texto: str) -> str:
    return "\n".join(re.sub(r"\s#.*$|^#.*$", "", linha) for linha in texto.splitlines())


def _servico(nome: str) -> str:
    """O bloco de um serviço do compose (do nome até o próximo serviço ou seção)."""
    achado = re.search(rf"^  {nome}:\n(.*?)(?=^  \S|^\S)", COMPOSE_DE_TESTE, re.S | re.M)
    assert achado, nome
    return _sem_comentarios(achado.group(1))


def test_a_imagem_de_producao_nao_copia_o_pacote_de_teste():
    assert "dados_de_teste" not in DOCKERFILE_DE_PRODUCAO
    assert "dados_de_teste" in DOCKERFILE_DE_TESTE


def test_as_imagens_base_do_teste_sao_as_da_producao_fixadas_por_digest():
    def bases(dockerfile: str) -> list[str]:
        return re.findall(r"^FROM (\S+)", dockerfile, re.M)

    assert bases(DOCKERFILE_DE_TESTE) == bases(DOCKERFILE_DE_PRODUCAO)
    assert all("@sha256:" in base for base in bases(DOCKERFILE_DE_TESTE))


def test_a_imagem_de_teste_roda_sem_privilegios_e_nao_leva_a_variavel_de_teste():
    assert "USER gastoba" in DOCKERFILE_DE_TESTE
    assert "GASTOBA_AMBIENTE_DE_TESTE" not in DOCKERFILE_DE_TESTE  # vem só do compose
    assert "/dados-de-teste" in DOCKERFILE_DE_TESTE


def test_portas_so_em_loopback_e_so_na_tela():
    codigo = _sem_comentarios(COMPOSE_DE_TESTE)

    assert "0.0.0.0" not in codigo
    portas = re.findall(r'^\s+- "([^"]+:\d+:\d+)"', codigo, re.M)
    assert portas == ["127.0.0.1:8180:8080"]
    assert "ports:" not in _servico("api-teste")
    assert "ports:" not in _servico("popular")


def test_a_api_de_teste_so_alcanca_a_rede_interna_sem_saida():
    assert re.search(r"^  interna:\n    internal: true", COMPOSE_DE_TESTE, re.M)
    for servico in ("popular", "api-teste"):
        bloco = _servico(servico)
        assert "interna" in bloco
        assert "publica" not in bloco
    assert "- api" in _servico("api-teste")  # o alias que o nginx da imagem do frontend usa


def test_todo_servico_tem_as_restricoes_do_compose_de_producao():
    # A âncora `seguranca` (read_only, cap_drop ALL, no-new-privileges) é mesclada nos três.
    assert COMPOSE_DE_TESTE.count("<<: *seguranca") == 3
    ancora = re.search(r"x-seguranca: &seguranca\n(.*?)\n\n", COMPOSE_DE_TESTE, re.S)
    assert ancora
    for exigido in ("read_only: true", "- ALL", "no-new-privileges:true"):
        assert exigido in ancora.group(1)


def test_a_pluggy_so_tem_valores_ficticios_e_sem_sincronizacao_periodica():
    api = _servico("api-teste")

    assert "GASTOBA_PLUGGY_CLIENT_ID: id-ficticio" in api
    assert "GASTOBA_PLUGGY_CLIENT_SECRET: segredo-ficticio" in api
    assert 'GASTOBA_PLUGGY_INTERVALO_HORAS: "0"' in api
    assert "GASTOBA_PLUGGY_EMAIL_DO_DONO: teste@exemplo.com" in api


def test_o_banco_de_teste_fica_em_volume_proprio_e_longe_do_de_producao():
    codigo = _sem_comentarios(COMPOSE_DE_TESTE)

    assert "dados-de-teste:/dados-de-teste" in codigo
    assert "gastobs.db" not in codigo
    assert re.search(r"^name: gastoba-teste$", codigo, re.M)
