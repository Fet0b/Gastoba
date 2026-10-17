"""Transforma a regra de dependência do DDD em teste: quebra o build quando violada."""

import ast
import sys
from collections.abc import Callable
from pathlib import Path

RAIZ_DO_PACOTE = Path(__file__).resolve().parents[2] / "src" / "gastoba"

FRAMEWORKS_PROIBIDOS_NA_APLICACAO = (
    "fastapi",
    "starlette",
    "sqlalchemy",
    "pydantic",
    "pydantic_settings",
    "alembic",
    "httpx",
    "uvicorn",
)


def _arquivos_da_camada(camada: str) -> list[Path]:
    arquivos = sorted((RAIZ_DO_PACOTE / camada).rglob("*.py"))
    assert arquivos, f"nenhum arquivo .py encontrado na camada {camada!r}"
    return arquivos


def _imports_absolutos(arquivo: Path) -> list[str]:
    arvore = ast.parse(arquivo.read_text(encoding="utf-8"), filename=str(arquivo))
    modulos: list[str] = []
    for no in ast.walk(arvore):
        if isinstance(no, ast.Import):
            modulos.extend(alias.name for alias in no.names)
        elif isinstance(no, ast.ImportFrom) and no.level == 0 and no.module:
            modulos.append(no.module)
    return modulos


def _pertence_a(modulo: str, prefixo: str) -> bool:
    return modulo == prefixo or modulo.startswith(f"{prefixo}.")


def _violacoes(camada: str, eh_proibido: Callable[[str], bool]) -> list[str]:
    return [
        f"{arquivo.relative_to(RAIZ_DO_PACOTE)} importa {modulo!r}"
        for arquivo in _arquivos_da_camada(camada)
        for modulo in _imports_absolutos(arquivo)
        if eh_proibido(modulo)
    ]


def test_domain_so_importa_biblioteca_padrao_e_o_proprio_domain():
    def eh_proibido(modulo: str) -> bool:
        eh_stdlib = modulo.split(".")[0] in sys.stdlib_module_names
        return not (eh_stdlib or _pertence_a(modulo, "gastoba.domain"))

    violacoes = _violacoes("domain", eh_proibido)

    assert not violacoes, "domain fora da regra:\n" + "\n".join(violacoes)


def test_application_nao_importa_infraestrutura_entradas_nem_frameworks():
    proibidos = (
        "gastoba.infrastructure",
        "gastoba.api",
        "gastoba.administracao",
        *FRAMEWORKS_PROIBIDOS_NA_APLICACAO,
    )

    def eh_proibido(modulo: str) -> bool:
        return any(_pertence_a(modulo, prefixo) for prefixo in proibidos)

    violacoes = _violacoes("application", eh_proibido)

    assert not violacoes, "application fora da regra:\n" + "\n".join(violacoes)


def test_infrastructure_nao_importa_as_camadas_de_entrada():
    def eh_proibido(modulo: str) -> bool:
        return _pertence_a(modulo, "gastoba.api") or _pertence_a(modulo, "gastoba.administracao")

    violacoes = _violacoes("infrastructure", eh_proibido)

    assert not violacoes, "infrastructure fora da regra:\n" + "\n".join(violacoes)


# Duas camadas de entrada, cada uma um composition root: a api (HTTP) e a administracao
# (comandos de terminal). Ambas montam infrastructure + application; uma não importa a outra.
def test_api_nao_importa_a_administracao():
    violacoes = _violacoes("api", lambda modulo: _pertence_a(modulo, "gastoba.administracao"))

    assert not violacoes, "api fora da regra:\n" + "\n".join(violacoes)


def test_administracao_nao_importa_a_api_nem_frameworks_web():
    proibidos = ("gastoba.api", "fastapi", "starlette", "uvicorn", "httpx")

    def eh_proibido(modulo: str) -> bool:
        return any(_pertence_a(modulo, prefixo) for prefixo in proibidos)

    violacoes = _violacoes("administracao", eh_proibido)

    assert not violacoes, "administracao fora da regra:\n" + "\n".join(violacoes)


def test_camadas_conhecidas_sao_as_unicas_do_pacote():
    # Uma camada nova precisa de regra própria neste arquivo antes de existir.
    camadas = {
        caminho.name
        for caminho in RAIZ_DO_PACOTE.iterdir()
        if caminho.is_dir() and any(caminho.rglob("*.py"))
    }

    assert camadas == {
        "domain",
        "application",
        "infrastructure",
        "api",
        "administracao",
    }


def test_pacote_nao_usa_imports_relativos():
    # Imports relativos burlariam as checagens acima, por isso são proibidos no pacote.
    violacoes = []
    for arquivo in sorted(RAIZ_DO_PACOTE.rglob("*.py")):
        arvore = ast.parse(arquivo.read_text(encoding="utf-8"), filename=str(arquivo))
        for no in ast.walk(arvore):
            if isinstance(no, ast.ImportFrom) and no.level > 0:
                modulo = "." * no.level + (no.module or "")
                violacoes.append(f"{arquivo.relative_to(RAIZ_DO_PACOTE)} importa {modulo!r}")

    assert not violacoes, "imports relativos encontrados:\n" + "\n".join(violacoes)
