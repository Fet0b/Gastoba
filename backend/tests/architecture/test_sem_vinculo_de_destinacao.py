from pathlib import Path


def test_codigo_nao_conhece_vinculo_de_destinacao():
    raiz = Path(__file__).resolve().parents[2] / "src"
    for arquivo in raiz.rglob("*.py"):
        texto = arquivo.read_text()
        assert "vinculos_das_destinacoes" not in texto, arquivo
        assert "VinculoDaDestinacao" not in texto, arquivo
