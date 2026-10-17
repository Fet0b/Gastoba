from types import TracebackType
from typing import Self

from sqlalchemy.orm import Session, sessionmaker

from gastoba.infrastructure.persistencia.repositorios import (
    RepositorioDeChavesDeApiSqlAlchemy,
    RepositorioDeContasSqlAlchemy,
    RepositorioDeGanhosSqlAlchemy,
    RepositorioDeGastosSqlAlchemy,
    RepositorioDeMetasSqlAlchemy,
    RepositorioDeRecorrenciasSqlAlchemy,
    RepositorioDeSessoesSqlAlchemy,
    RepositorioDeTransacoesImportadasSqlAlchemy,
    RepositorioDeUsuariosSqlAlchemy,
)


class UnidadeDeTrabalhoSqlAlchemy:
    """Satisfaz a porta UnidadeDeTrabalho; cada ``with`` usa uma sessão nova.

    Pode ser reutilizada em vários ``with`` em sequência, nunca aninhados.
    """

    usuarios: RepositorioDeUsuariosSqlAlchemy
    contas: RepositorioDeContasSqlAlchemy
    gastos: RepositorioDeGastosSqlAlchemy
    ganhos: RepositorioDeGanhosSqlAlchemy
    transacoes_importadas: RepositorioDeTransacoesImportadasSqlAlchemy
    recorrencias: RepositorioDeRecorrenciasSqlAlchemy
    metas: RepositorioDeMetasSqlAlchemy
    sessoes: RepositorioDeSessoesSqlAlchemy
    chaves_de_api: RepositorioDeChavesDeApiSqlAlchemy

    def __init__(self, fabrica_de_sessoes: sessionmaker[Session]) -> None:
        self._fabrica_de_sessoes = fabrica_de_sessoes
        self._sessao: Session | None = None

    def __enter__(self) -> Self:
        self._sessao = self._fabrica_de_sessoes()
        self.usuarios = RepositorioDeUsuariosSqlAlchemy(self._sessao)
        self.contas = RepositorioDeContasSqlAlchemy(self._sessao)
        self.gastos = RepositorioDeGastosSqlAlchemy(self._sessao)
        self.ganhos = RepositorioDeGanhosSqlAlchemy(self._sessao)
        self.transacoes_importadas = RepositorioDeTransacoesImportadasSqlAlchemy(self._sessao)
        self.recorrencias = RepositorioDeRecorrenciasSqlAlchemy(self._sessao)
        self.metas = RepositorioDeMetasSqlAlchemy(self._sessao)
        self.sessoes = RepositorioDeSessoesSqlAlchemy(self._sessao)
        self.chaves_de_api = RepositorioDeChavesDeApiSqlAlchemy(self._sessao)
        return self

    def __exit__(
        self,
        tipo: type[BaseException] | None,
        valor: BaseException | None,
        traceback: TracebackType | None,
    ) -> None:
        assert self._sessao is not None, "__exit__ sem __enter__"
        # Depois de um commit o rollback não tem o que desfazer.
        try:
            self._sessao.rollback()
        finally:
            self._sessao.close()
            self._sessao = None

    def commit(self) -> None:
        assert self._sessao is not None, "commit fora de um bloco with"
        self._sessao.commit()
