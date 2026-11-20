from types import TracebackType
from typing import Self

from sqlalchemy.orm import Session, sessionmaker

from gastoba.infrastructure.persistencia.operacoes import (
    RepositorioDeAlocacoesSqlAlchemy,
    RepositorioDeCasamentosSqlAlchemy,
    RepositorioDeMudancasDeFracaoSqlAlchemy,
    RepositorioDeOperacoesSqlAlchemy,
)
from gastoba.infrastructure.persistencia.repositorios import (
    RepositorioDeAparenciasSqlAlchemy,
    RepositorioDeChavesDeApiSqlAlchemy,
    RepositorioDeCoberturasSqlAlchemy,
    RepositorioDeContasSqlAlchemy,
    RepositorioDeCoresDasDestinacoesSqlAlchemy,
    RepositorioDeDestinacoesCadastradasSqlAlchemy,
    RepositorioDeDestinacoesSqlAlchemy,
    RepositorioDeFaturasSqlAlchemy,
    RepositorioDeGanhosSqlAlchemy,
    RepositorioDeGastosSqlAlchemy,
    RepositorioDeGuardadoNasMetasSqlAlchemy,
    RepositorioDeHistoricoDeMetasSqlAlchemy,
    RepositorioDeInvestimentosSqlAlchemy,
    RepositorioDeMetasSqlAlchemy,
    RepositorioDeMovimentosDeInvestimentoSqlAlchemy,
    RepositorioDeReaplicacoesDeResgatesSqlAlchemy,
    RepositorioDeRecorrenciasSqlAlchemy,
    RepositorioDeRendaBaseSqlAlchemy,
    RepositorioDeSessoesSqlAlchemy,
    RepositorioDeTransacoesImportadasSqlAlchemy,
    RepositorioDeUsuariosSqlAlchemy,
)
from gastoba.infrastructure.persistencia.transferencias import RepositorioDeTransferenciasSqlAlchemy
from gastoba.infrastructure.persistencia.tratamentos import RepositorioDeTratamentosSqlAlchemy


class UnidadeDeTrabalhoSqlAlchemy:
    """Satisfaz a porta UnidadeDeTrabalho; cada ``with`` usa uma sessão nova.

    Pode ser reutilizada em vários ``with`` em sequência, nunca aninhados.
    """

    usuarios: RepositorioDeUsuariosSqlAlchemy
    contas: RepositorioDeContasSqlAlchemy
    gastos: RepositorioDeGastosSqlAlchemy
    ganhos: RepositorioDeGanhosSqlAlchemy
    faturas: RepositorioDeFaturasSqlAlchemy
    transacoes_importadas: RepositorioDeTransacoesImportadasSqlAlchemy
    investimentos: RepositorioDeInvestimentosSqlAlchemy
    movimentos_de_investimento: RepositorioDeMovimentosDeInvestimentoSqlAlchemy
    destinacoes: RepositorioDeDestinacoesSqlAlchemy
    destinacoes_cadastradas: RepositorioDeDestinacoesCadastradasSqlAlchemy
    recorrencias: RepositorioDeRecorrenciasSqlAlchemy
    renda_base: RepositorioDeRendaBaseSqlAlchemy
    aparencias: RepositorioDeAparenciasSqlAlchemy
    guardado_nas_metas: RepositorioDeGuardadoNasMetasSqlAlchemy
    metas: RepositorioDeMetasSqlAlchemy
    sessoes: RepositorioDeSessoesSqlAlchemy
    chaves_de_api: RepositorioDeChavesDeApiSqlAlchemy

    def __init__(self, fabrica_de_sessoes: sessionmaker[Session]) -> None:
        self._fabrica_de_sessoes = fabrica_de_sessoes
        self._sessao: Session | None = None

    def __enter__(self) -> Self:
        self._sessao = self._fabrica_de_sessoes()
        self.transferencias = RepositorioDeTransferenciasSqlAlchemy(self._sessao)
        self.operacoes = RepositorioDeOperacoesSqlAlchemy(self._sessao)
        self.tratamentos = RepositorioDeTratamentosSqlAlchemy(self._sessao)
        self.alocacoes = RepositorioDeAlocacoesSqlAlchemy(self._sessao)
        self.mudancas_de_fracao = RepositorioDeMudancasDeFracaoSqlAlchemy(self._sessao)
        self.casamentos = RepositorioDeCasamentosSqlAlchemy(self._sessao)
        self.usuarios = RepositorioDeUsuariosSqlAlchemy(self._sessao)
        self.cores_das_destinacoes = RepositorioDeCoresDasDestinacoesSqlAlchemy(self._sessao)
        self.coberturas = RepositorioDeCoberturasSqlAlchemy(self._sessao)
        self.faturas = RepositorioDeFaturasSqlAlchemy(self._sessao)
        self.contas = RepositorioDeContasSqlAlchemy(self._sessao)
        self.gastos = RepositorioDeGastosSqlAlchemy(self._sessao)
        self.ganhos = RepositorioDeGanhosSqlAlchemy(self._sessao)
        self.transacoes_importadas = RepositorioDeTransacoesImportadasSqlAlchemy(self._sessao)
        self.investimentos = RepositorioDeInvestimentosSqlAlchemy(self._sessao)
        self.movimentos_de_investimento = RepositorioDeMovimentosDeInvestimentoSqlAlchemy(
            self._sessao
        )
        self.destinacoes = RepositorioDeDestinacoesSqlAlchemy(self._sessao)
        self.destinacoes_cadastradas = RepositorioDeDestinacoesCadastradasSqlAlchemy(self._sessao)
        self.recorrencias = RepositorioDeRecorrenciasSqlAlchemy(self._sessao)
        self.renda_base = RepositorioDeRendaBaseSqlAlchemy(self._sessao)
        self.aparencias = RepositorioDeAparenciasSqlAlchemy(self._sessao)
        self.guardado_nas_metas = RepositorioDeGuardadoNasMetasSqlAlchemy(self._sessao)
        self.historico_de_metas = RepositorioDeHistoricoDeMetasSqlAlchemy(self._sessao)
        self.reaplicacoes_de_resgates = RepositorioDeReaplicacoesDeResgatesSqlAlchemy(self._sessao)
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
