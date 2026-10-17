# syntax=docker/dockerfile:1
#
# Imagem do backend do Gastoba (API FastAPI + SQLite).
# As imagens-base estão fixadas por digest (consultados em 2026-10-10); para atualizá-las,
# troque o digest pelo da tag desejada. O digest fixo impede atualizações automáticas da base.

FROM ghcr.io/astral-sh/uv:0.12.23@sha256:61d393e44e249f2e4b526b6c7ddcecce245946826e608e11c93ad4f5bba55b21 AS uv

# ---------------------------------------------------------------------------
# Estágio de construção: instala só as dependências de produção num ambiente virtual.
# ---------------------------------------------------------------------------
FROM python:3.14-slim@sha256:a2b82f3c48559aa0a8446d9af49826b6e2b2016f4cd2afabfe6013ec53729170 AS construcao

COPY --from=uv /uv /bin/uv

# UV_LINK_MODE=copy: o ambiente é copiado para o estágio final, então nada de links.
# UV_PYTHON_PREFERENCE=only-system / UV_PYTHON_DOWNLOADS=never: usa o Python da imagem.
ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_PREFERENCE=only-system \
    UV_PYTHON_DOWNLOADS=never

WORKDIR /app

# Dependências primeiro (camada em cache enquanto pyproject.toml e uv.lock não mudam).
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

# Depois o código do pacote, instalado sem modo editável (cópia no site-packages).
COPY src ./src
RUN uv sync --frozen --no-dev --no-editable

# ---------------------------------------------------------------------------
# Estágio final: só o ambiente virtual, as migrations e um usuário sem privilégios.
# ---------------------------------------------------------------------------
FROM python:3.14-slim@sha256:a2b82f3c48559aa0a8446d9af49826b6e2b2016f4cd2afabfe6013ec53729170

RUN groupadd --system gastoba \
    && useradd --system --gid gastoba --home-dir /app --no-create-home --shell /usr/sbin/nologin gastoba \
    && mkdir /dados \
    && chown gastoba:gastoba /dados

WORKDIR /app

COPY --from=construcao /app/.venv /app/.venv
COPY alembic.ini ./
COPY migrations ./migrations

# O banco fica no volume /dados (caminho absoluto: sqlite:/// + /dados/gastobs.db).
ENV PATH="/app/.venv/bin:${PATH}" \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    GASTOBA_URL_BANCO=sqlite:////dados/gastobs.db

USER gastoba
VOLUME ["/dados"]
EXPOSE 8000

# A imagem slim não tem curl; o próprio Python consulta /health (qualquer resposta
# diferente de 200 faz urlopen levantar erro e o comando sair com status diferente de zero).
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD ["python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=3)"]

# Aplica as migrations e sobe a API. Escuta em 0.0.0.0 só dentro do contêiner; o compose
# publica a porta apenas em 127.0.0.1 porque a API não fornece HTTPS próprio.
CMD ["sh", "-c", "alembic upgrade head && exec uvicorn gastoba.api.app:criar_app --factory --host 0.0.0.0 --port 8000"]
