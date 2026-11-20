"""Composition root: único ponto que conhece as implementações concretas das portas."""

from dataclasses import dataclass, field
from datetime import timedelta
from typing import Annotated

from fastapi import Depends, FastAPI, Request
from sqlalchemy import Engine
from sqlalchemy.orm import Session, sessionmaker

from gastoba.api.erros import RequisicaoSemCabecalhoDeOrigem
from gastoba.application.aceitar_transacao_importada import AceitarTransacaoImportada
from gastoba.application.aceitar_transacao_importada_dividida import (
    AceitarTransacaoImportadaDividida,
)
from gastoba.application.aceitar_transacoes_importadas_em_lote import (
    AceitarTransacoesImportadasEmLote,
)
from gastoba.application.alocar_caixinha import AlocarCaixinha
from gastoba.application.alterar_operacao import AlterarOperacao
from gastoba.application.alterar_recorrencia import AlterarRecorrencia
from gastoba.application.aprovar_tratamentos_de_aporte import AprovarTratamentosDeAporte
from gastoba.application.associar_compra_a_destinacao import AssociarCompraADestinacao
from gastoba.application.associar_movimento_ao_investimento import (
    AssociarMovimentoAoInvestimento,
)
from gastoba.application.autenticacao import Autenticacao, exigir_escopo, exigir_sessao
from gastoba.application.autenticar_por_chave_de_api import AutenticarPorChaveDeApi
from gastoba.application.autenticar_por_sessao import AutenticarPorSessao
from gastoba.application.cadastrar_usuario import CadastrarUsuario
from gastoba.application.classificar_natureza_do_resgate import ClassificarNaturezaDoResgate
from gastoba.application.classificar_transferencia import ClassificarTransferencia
from gastoba.application.completar_par_da_transferencia import CompletarParDaTransferencia
from gastoba.application.confirmar_reaplicacao_de_resgate import ConfirmarReaplicacaoDeResgate
from gastoba.application.consultar_aparencia import ConsultarAparencia
from gastoba.application.consultar_guardado_nas_metas import ConsultarGuardadoNasMetas
from gastoba.application.consultar_historico_de_investimentos import (
    ConsultarHistoricoDeInvestimentos,
)
from gastoba.application.consultar_impacto_da_reversao import ConsultarImpactoDaReversao
from gastoba.application.consultar_progresso_das_metas import ConsultarProgressoDasMetas
from gastoba.application.consultar_reconciliacao_da_caixinha import ConsultarReconciliacaoDaCaixinha
from gastoba.application.consultar_renda_base import ConsultarRendaBase
from gastoba.application.criar_chave_de_api import CriarChaveDeApi
from gastoba.application.criar_conta import CriarConta
from gastoba.application.criar_destinacao_cadastrada import CriarDestinacaoCadastrada
from gastoba.application.criar_recorrencia import CriarRecorrencia
from gastoba.application.definir_aparencia import DefinirAparencia
from gastoba.application.definir_apelido_da_conta import DefinirApelidoDaConta
from gastoba.application.definir_caixinha import DefinirCaixinha
from gastoba.application.definir_cor_da_destinacao import DefinirCorDaDestinacao
from gastoba.application.definir_destinacoes_do_investimento import (
    DefinirDestinacoesDoInvestimento,
)
from gastoba.application.definir_guardado_nas_metas import DefinirGuardadoNasMetas
from gastoba.application.definir_icone_da_caixinha import DefinirIconeDaCaixinha
from gastoba.application.definir_meta import DefinirMeta
from gastoba.application.definir_papel_da_conta import DefinirPapelDaConta
from gastoba.application.definir_referencia_da_caixinha import DefinirReferenciaDaCaixinha
from gastoba.application.definir_renda_base import DefinirRendaBase
from gastoba.application.desassociar_compra_da_destinacao import DesassociarCompraDaDestinacao
from gastoba.application.desfazer_casamento import DesfazerCasamento
from gastoba.application.desfazer_classificacao_de_investimento import (
    DesfazerClassificacaoDeInvestimento,
)
from gastoba.application.desfazer_classificacao_importada import DesfazerClassificacaoImportada
from gastoba.application.desfazer_realocacao import DesfazerRealocacao
from gastoba.application.desfazer_saldo_inicial import DesfazerSaldoInicial
from gastoba.application.desfazer_tratamento_de_aporte import DesfazerTratamentoDeAporte
from gastoba.application.diagnosticar_contabilidade import DiagnosticarContabilidade
from gastoba.application.encerrar_recorrencia import EncerrarRecorrencia
from gastoba.application.entrar_com_senha import EntrarComSenha
from gastoba.application.excluir_aporte_sem_investimento import ExcluirAporteSemInvestimento
from gastoba.application.excluir_conta import ExcluirConta
from gastoba.application.excluir_destinacao_cadastrada import ExcluirDestinacaoCadastrada
from gastoba.application.excluir_ganho import ExcluirGanho
from gastoba.application.excluir_operacao import ExcluirOperacao
from gastoba.application.ignorar_transacao_importada import IgnorarTransacaoImportada
from gastoba.application.lancar_operacao_manual import LancarOperacaoManual
from gastoba.application.listar_aportes_sem_investimento import ListarAportesSemInvestimento
from gastoba.application.listar_chaves_de_api import ListarChavesDeApi
from gastoba.application.listar_contas import ListarContas
from gastoba.application.listar_destinacoes_cadastradas import ListarDestinacoesCadastradas
from gastoba.application.listar_faturas import ListarFaturas
from gastoba.application.listar_ganhos import ListarGanhos
from gastoba.application.listar_gastos import ListarGastos
from gastoba.application.listar_historico_de_metas import ListarHistoricoDeMetas
from gastoba.application.listar_investimentos import ListarInvestimentos
from gastoba.application.listar_metas import ListarMetas
from gastoba.application.listar_movimentos_de_investimento import ListarMovimentosDeInvestimento
from gastoba.application.listar_operacoes import ListarOperacoes
from gastoba.application.listar_pendencias_de_revisao import ListarPendenciasDeRevisao
from gastoba.application.listar_realocacoes import ListarRealocacoes
from gastoba.application.listar_reaplicacoes_de_resgates import ListarReaplicacoesDeResgates
from gastoba.application.listar_recorrencias import ListarRecorrencias
from gastoba.application.listar_reservas_das_destinacoes import ListarReservasDasDestinacoes
from gastoba.application.listar_resgates_para_reaplicar import ListarResgatesParaReaplicar
from gastoba.application.listar_resgates_sem_destinacao import ListarResgatesSemDestinacao
from gastoba.application.listar_tags import ListarTags
from gastoba.application.listar_transacoes_importadas import ListarTransacoesImportadas
from gastoba.application.listar_transferencias import ListarTransferencias
from gastoba.application.mesclar_aporte_sem_investimento import MesclarAporteSemInvestimento
from gastoba.application.obter_fatura import ObterFatura
from gastoba.application.realocar_destinacao import RealocarDestinacao
from gastoba.application.reclassificar_transacao_importada import ReclassificarTransacaoImportada
from gastoba.application.registrar_ganho import RegistrarGanho
from gastoba.application.registrar_gasto import RegistrarGasto
from gastoba.application.remover_apelido_da_conta import RemoverApelidoDaConta
from gastoba.application.remover_caixinhas_do_resgate import RemoverCaixinhasDoResgate
from gastoba.application.remover_cor_da_destinacao import RemoverCorDaDestinacao
from gastoba.application.remover_meta import RemoverMeta
from gastoba.application.remover_reaplicacao_de_resgate import RemoverReaplicacaoDeResgate
from gastoba.application.remover_renda_base import RemoverRendaBase
from gastoba.application.restaurar_aparencia import RestaurarAparencia
from gastoba.application.restaurar_transacao_importada import RestaurarTransacaoImportada
from gastoba.application.resumir_gastos_por_tag import ResumirGastosPorTag
from gastoba.application.resumir_investimentos import ResumirInvestimentos
from gastoba.application.revisar_aporte import RevisarAporte
from gastoba.application.revisar_gasto_legado import RevisarGastoLegado
from gastoba.application.revisar_recorrencia_legada import RevisarRecorrenciaLegada
from gastoba.application.revogar_chave_de_api import RevogarChaveDeApi
from gastoba.application.sair_da_sessao import SairDaSessao
from gastoba.application.sincronizar_contas_bancarias import SincronizarContasBancarias
from gastoba.application.verificar_gestao_de_investimentos import VerificarGestaoDeInvestimentos
from gastoba.application.verificar_saude import VerificarSaude
from gastoba.domain.chave_de_api import EscopoDaChave
from gastoba.domain.email import Email
from gastoba.domain.excecoes import EmailInvalido, ImportacaoDesligada, NaoAutenticado
from gastoba.domain.portas import (
    GeradorDeSegredo,
    HasherDeSenha,
    LimitadorDeTentativas,
    Relogio,
    UnidadeDeTrabalho,
)
from gastoba.domain.segredo_de_acesso import (
    PREFIXO_DE_CHAVE_DE_API,
    PREFIXO_DE_SESSAO,
    TAMANHO_MAXIMO_DO_SEGREDO,
)
from gastoba.domain.usuario import Usuario
from gastoba.infrastructure.configuracoes import Configuracoes
from gastoba.infrastructure.persistencia.unidade_de_trabalho import UnidadeDeTrabalhoSqlAlchemy
from gastoba.infrastructure.persistencia.verificador_de_banco import VerificadorDeBancoSqlAlchemy

NOME_DO_COOKIE_DE_SESSAO = "gastoba_sessao"
# Cabeçalho que um formulário de outro site não consegue enviar sem o preflight do CORS:
# exigido quando o cookie (que o navegador manda sozinho) autentica uma escrita.
CABECALHO_ANTI_CSRF = "X-Gastoba-Requisicao"
METODOS_DE_LEITURA = frozenset({"GET", "HEAD", "OPTIONS"})


def obter_engine(request: Request) -> Engine:
    return request.app.state.engine


def obter_verificar_saude(engine: Annotated[Engine, Depends(obter_engine)]) -> VerificarSaude:
    return VerificarSaude(VerificadorDeBancoSqlAlchemy(engine))


def obter_fabrica_de_sessoes(request: Request) -> sessionmaker[Session]:
    return request.app.state.fabrica_de_sessoes


def obter_configuracoes_da_app(request: Request) -> Configuracoes:
    return request.app.state.configuracoes


def obter_relogio(request: Request) -> Relogio:
    return request.app.state.relogio


def obter_hasher_de_senha(request: Request) -> HasherDeSenha:
    return request.app.state.hasher_de_senha


def obter_gerador_de_segredo(request: Request) -> GeradorDeSegredo:
    return request.app.state.gerador_de_segredo


def obter_limitador_de_tentativas(request: Request) -> LimitadorDeTentativas:
    return request.app.state.limitador_de_tentativas


def obter_unidade_de_trabalho(
    fabrica_de_sessoes: Annotated[sessionmaker[Session], Depends(obter_fabrica_de_sessoes)],
) -> UnidadeDeTrabalho:
    return UnidadeDeTrabalhoSqlAlchemy(fabrica_de_sessoes)


# use_cache=False: sem isso o FastAPI entregaria a mesma instância a todos que a pedem na
# requisição, e o usuário atual e o caso de uso da rota compartilhariam a unidade de trabalho.
UnidadeDeTrabalhoPropria = Annotated[
    UnidadeDeTrabalho, Depends(obter_unidade_de_trabalho, use_cache=False)
]
ConfiguracoesDaApp = Annotated[Configuracoes, Depends(obter_configuracoes_da_app)]
RelogioDaApp = Annotated[Relogio, Depends(obter_relogio)]
HasherDaApp = Annotated[HasherDeSenha, Depends(obter_hasher_de_senha)]
GeradorDaApp = Annotated[GeradorDeSegredo, Depends(obter_gerador_de_segredo)]


# Autenticação


@dataclass(frozen=True, slots=True)
class Credencial:
    """O token enviado e por onde chegou (o cookie exige a proteção contra CSRF)."""

    token: str = field(repr=False)  # fora do repr: tracebacks e logs não o mostram
    por_cookie: bool


def obter_credencial(request: Request) -> Credencial:
    """``Authorization: Bearer <token>`` ou, sem esse cabeçalho, o cookie de sessão."""
    autorizacao = request.headers.get("Authorization")
    if autorizacao is not None:
        esquema, _, token = autorizacao.strip().partition(" ")
        token = token.strip()
        if esquema.lower() != "bearer" or not token:
            raise NaoAutenticado()
        credencial = Credencial(token, por_cookie=False)
    else:
        token = request.cookies.get(NOME_DO_COOKIE_DE_SESSAO, "")
        # O cookie só carrega sessão: uma chave de API nele não vale.
        if not token.startswith(PREFIXO_DE_SESSAO):
            raise NaoAutenticado()
        credencial = Credencial(token, por_cookie=True)
    # Barra tokens enormes antes de qualquer consulta ou hash.
    if len(credencial.token) > TAMANHO_MAXIMO_DO_SEGREDO:
        raise NaoAutenticado()
    return credencial


def obter_autenticacao(
    request: Request,
    credencial: Annotated[Credencial, Depends(obter_credencial)],
    unidade_de_trabalho: UnidadeDeTrabalhoPropria,
    relogio: RelogioDaApp,
) -> Autenticacao:
    """Quem chama e por qual meio; confere a proteção contra CSRF e o escopo pelo método."""
    if credencial.token.startswith(PREFIXO_DE_SESSAO):
        autenticacao = AutenticarPorSessao(unidade_de_trabalho, relogio).executar(credencial.token)
    elif credencial.token.startswith(PREFIXO_DE_CHAVE_DE_API):
        autenticacao = AutenticarPorChaveDeApi(unidade_de_trabalho, relogio).executar(
            credencial.token
        )
    else:
        raise NaoAutenticado()

    eh_leitura = request.method in METODOS_DE_LEITURA
    if credencial.por_cookie and not eh_leitura and request.headers.get(CABECALHO_ANTI_CSRF) != "1":
        raise RequisicaoSemCabecalhoDeOrigem()
    exigir_escopo(autenticacao, EscopoDaChave.LEITURA if eh_leitura else EscopoDaChave.ESCRITA)
    return autenticacao


AutenticacaoAtual = Annotated[Autenticacao, Depends(obter_autenticacao)]


def obter_usuario_atual(autenticacao: AutenticacaoAtual) -> Usuario:
    """Ponto único de autenticação das rotas de negócio: sessão ou chave de API."""
    return autenticacao.usuario


def obter_autenticacao_de_sessao(autenticacao: AutenticacaoAtual) -> Autenticacao:
    """Como ``obter_autenticacao``, mas recusa chave de API (ex.: para gerir chaves)."""
    exigir_sessao(autenticacao)
    return autenticacao


# Casos de uso


def obter_criar_conta(unidade_de_trabalho: UnidadeDeTrabalhoPropria) -> CriarConta:
    return CriarConta(unidade_de_trabalho)


def obter_listar_contas(unidade_de_trabalho: UnidadeDeTrabalhoPropria) -> ListarContas:
    return ListarContas(unidade_de_trabalho)


def obter_registrar_gasto(unidade_de_trabalho: UnidadeDeTrabalhoPropria) -> RegistrarGasto:
    return RegistrarGasto(unidade_de_trabalho)


def obter_listar_gastos(unidade_de_trabalho: UnidadeDeTrabalhoPropria) -> ListarGastos:
    return ListarGastos(unidade_de_trabalho)


def obter_resumir_gastos_por_tag(
    unidade_de_trabalho: UnidadeDeTrabalhoPropria,
) -> ResumirGastosPorTag:
    return ResumirGastosPorTag(unidade_de_trabalho)


def obter_registrar_ganho(unidade_de_trabalho: UnidadeDeTrabalhoPropria) -> RegistrarGanho:
    return RegistrarGanho(unidade_de_trabalho)


def obter_excluir_conta(unidade_de_trabalho: UnidadeDeTrabalhoPropria) -> ExcluirConta:
    return ExcluirConta(unidade_de_trabalho)


def obter_excluir_ganho(unidade_de_trabalho: UnidadeDeTrabalhoPropria) -> ExcluirGanho:
    return ExcluirGanho(unidade_de_trabalho)


def e_dono_da_importacao(configuracoes: Configuracoes, usuario: Usuario) -> bool:
    """A importação está ligada e a pessoa é a dona dela (o plano gratuito é de uso pessoal)."""
    if not configuracoes.importacao_ativa or usuario.email is None:
        return False
    try:
        dono = Email.de_texto(configuracoes.pluggy_email_do_dono or "")
    except EmailInvalido:
        return False
    return usuario.email == dono


def obter_dono_da_importacao(
    usuario: Annotated[Usuario, Depends(obter_usuario_atual)],
    configuracoes: ConfiguracoesDaApp,
) -> Usuario:
    """Para quem não é a dona (ou com a importação desligada) as rotas não existem: 404."""
    if not e_dono_da_importacao(configuracoes, usuario):
        raise ImportacaoDesligada("A importação bancária não está disponível.")
    return usuario


def obter_listar_faturas(unidade_de_trabalho: UnidadeDeTrabalhoPropria) -> ListarFaturas:
    return ListarFaturas(unidade_de_trabalho)


def obter_obter_fatura(unidade_de_trabalho: UnidadeDeTrabalhoPropria) -> ObterFatura:
    return ObterFatura(unidade_de_trabalho)


def obter_listar_transacoes_importadas(
    unidade_de_trabalho: UnidadeDeTrabalhoPropria,
) -> ListarTransacoesImportadas:
    return ListarTransacoesImportadas(unidade_de_trabalho)


def obter_aceitar_transacao_importada(
    unidade_de_trabalho: UnidadeDeTrabalhoPropria,
) -> AceitarTransacaoImportada:
    return AceitarTransacaoImportada(unidade_de_trabalho)


def obter_ignorar_transacao_importada(
    unidade_de_trabalho: UnidadeDeTrabalhoPropria,
) -> IgnorarTransacaoImportada:
    return IgnorarTransacaoImportada(unidade_de_trabalho)


def obter_restaurar_transacao_importada(
    unidade_de_trabalho: UnidadeDeTrabalhoPropria,
) -> RestaurarTransacaoImportada:
    return RestaurarTransacaoImportada(unidade_de_trabalho)


def criar_sincronizador(app: FastAPI) -> SincronizarContasBancarias:
    """Monta a sincronização a partir da app (também usada pela tarefa periódica)."""
    configuracoes: Configuracoes = app.state.configuracoes
    return SincronizarContasBancarias(
        UnidadeDeTrabalhoSqlAlchemy(app.state.fabrica_de_sessoes),
        app.state.provedor_open_finance,
        app.state.relogio,
        tuple(configuracoes.pluggy_item_ids),
        configuracoes.pluggy_email_do_dono or "",
        configuracoes.pluggy_dias_iniciais,
    )


def obter_sincronizador(request: Request) -> SincronizarContasBancarias:
    return criar_sincronizador(request.app)


def obter_listar_ganhos(unidade_de_trabalho: UnidadeDeTrabalhoPropria) -> ListarGanhos:
    return ListarGanhos(unidade_de_trabalho)


def obter_criar_recorrencia(
    unidade_de_trabalho: UnidadeDeTrabalhoPropria, relogio: RelogioDaApp
) -> CriarRecorrencia:
    return CriarRecorrencia(unidade_de_trabalho, relogio)


def obter_listar_recorrencias(unidade_de_trabalho: UnidadeDeTrabalhoPropria) -> ListarRecorrencias:
    return ListarRecorrencias(unidade_de_trabalho)


def obter_alterar_recorrencia(unidade_de_trabalho: UnidadeDeTrabalhoPropria) -> AlterarRecorrencia:
    return AlterarRecorrencia(unidade_de_trabalho)


def obter_encerrar_recorrencia(
    unidade_de_trabalho: UnidadeDeTrabalhoPropria,
) -> EncerrarRecorrencia:
    return EncerrarRecorrencia(unidade_de_trabalho)


def obter_definir_meta(
    unidade_de_trabalho: UnidadeDeTrabalhoPropria,
    relogio: Annotated[Relogio, Depends(obter_relogio)],
) -> DefinirMeta:
    return DefinirMeta(unidade_de_trabalho, relogio)


def obter_consultar_aparencia(unidade_de_trabalho: UnidadeDeTrabalhoPropria) -> ConsultarAparencia:
    return ConsultarAparencia(unidade_de_trabalho)


def obter_definir_aparencia(unidade_de_trabalho: UnidadeDeTrabalhoPropria) -> DefinirAparencia:
    return DefinirAparencia(unidade_de_trabalho)


def obter_restaurar_aparencia(unidade_de_trabalho: UnidadeDeTrabalhoPropria) -> RestaurarAparencia:
    return RestaurarAparencia(unidade_de_trabalho)


def obter_consultar_guardado_nas_metas(
    unidade_de_trabalho: UnidadeDeTrabalhoPropria,
) -> ConsultarGuardadoNasMetas:
    return ConsultarGuardadoNasMetas(unidade_de_trabalho)


def obter_definir_guardado_nas_metas(
    unidade_de_trabalho: UnidadeDeTrabalhoPropria,
) -> DefinirGuardadoNasMetas:
    return DefinirGuardadoNasMetas(unidade_de_trabalho)


def obter_listar_destinacoes_cadastradas(
    unidade_de_trabalho: UnidadeDeTrabalhoPropria,
) -> ListarDestinacoesCadastradas:
    return ListarDestinacoesCadastradas(unidade_de_trabalho)


def obter_criar_destinacao_cadastrada(
    unidade_de_trabalho: UnidadeDeTrabalhoPropria,
) -> CriarDestinacaoCadastrada:
    return CriarDestinacaoCadastrada(unidade_de_trabalho)


def obter_definir_icone_da_caixinha(
    unidade_de_trabalho: UnidadeDeTrabalhoPropria,
) -> DefinirIconeDaCaixinha:
    return DefinirIconeDaCaixinha(unidade_de_trabalho)


def obter_excluir_destinacao_cadastrada(
    unidade_de_trabalho: UnidadeDeTrabalhoPropria,
) -> ExcluirDestinacaoCadastrada:
    return ExcluirDestinacaoCadastrada(unidade_de_trabalho)


def obter_consultar_renda_base(unidade_de_trabalho: UnidadeDeTrabalhoPropria) -> ConsultarRendaBase:
    return ConsultarRendaBase(unidade_de_trabalho)


def obter_definir_renda_base(unidade_de_trabalho: UnidadeDeTrabalhoPropria) -> DefinirRendaBase:
    return DefinirRendaBase(unidade_de_trabalho)


def obter_remover_renda_base(unidade_de_trabalho: UnidadeDeTrabalhoPropria) -> RemoverRendaBase:
    return RemoverRendaBase(unidade_de_trabalho)


def obter_remover_meta(
    unidade_de_trabalho: UnidadeDeTrabalhoPropria,
    relogio: Annotated[Relogio, Depends(obter_relogio)],
) -> RemoverMeta:
    return RemoverMeta(unidade_de_trabalho, relogio)


def obter_listar_metas(unidade_de_trabalho: UnidadeDeTrabalhoPropria) -> ListarMetas:
    return ListarMetas(unidade_de_trabalho)


def obter_consultar_progresso_das_metas(
    unidade_de_trabalho: UnidadeDeTrabalhoPropria,
) -> ConsultarProgressoDasMetas:
    return ConsultarProgressoDasMetas(unidade_de_trabalho)


def obter_listar_tags(unidade_de_trabalho: UnidadeDeTrabalhoPropria) -> ListarTags:
    return ListarTags(unidade_de_trabalho)


def obter_cadastrar_usuario(
    unidade_de_trabalho: UnidadeDeTrabalhoPropria,
    hasher: HasherDaApp,
    configuracoes: ConfiguracoesDaApp,
) -> CadastrarUsuario:
    return CadastrarUsuario(unidade_de_trabalho, hasher, configuracoes.cadastro_aberto)


def obter_entrar_com_senha(
    unidade_de_trabalho: UnidadeDeTrabalhoPropria,
    hasher: HasherDaApp,
    gerador: GeradorDaApp,
    relogio: RelogioDaApp,
    configuracoes: ConfiguracoesDaApp,
    limitador: Annotated[LimitadorDeTentativas, Depends(obter_limitador_de_tentativas)],
) -> EntrarComSenha:
    return EntrarComSenha(
        unidade_de_trabalho,
        hasher,
        gerador,
        relogio,
        timedelta(hours=configuracoes.duracao_da_sessao_horas),
        limitador,
    )


def obter_sair_da_sessao(
    unidade_de_trabalho: UnidadeDeTrabalhoPropria, relogio: RelogioDaApp
) -> SairDaSessao:
    return SairDaSessao(unidade_de_trabalho, relogio)


def obter_criar_chave_de_api(
    unidade_de_trabalho: UnidadeDeTrabalhoPropria, gerador: GeradorDaApp, relogio: RelogioDaApp
) -> CriarChaveDeApi:
    return CriarChaveDeApi(unidade_de_trabalho, gerador, relogio)


def obter_listar_chaves_de_api(unidade_de_trabalho: UnidadeDeTrabalhoPropria) -> ListarChavesDeApi:
    return ListarChavesDeApi(unidade_de_trabalho)


def obter_revogar_chave_de_api(
    unidade_de_trabalho: UnidadeDeTrabalhoPropria,
) -> RevogarChaveDeApi:
    return RevogarChaveDeApi(unidade_de_trabalho)


def obter_aceitar_transacoes_importadas_em_lote(
    unidade_de_trabalho: UnidadeDeTrabalhoPropria,
) -> AceitarTransacoesImportadasEmLote:
    return AceitarTransacoesImportadasEmLote(unidade_de_trabalho)


def obter_listar_investimentos(
    unidade_de_trabalho: UnidadeDeTrabalhoPropria,
) -> ListarInvestimentos:
    return ListarInvestimentos(unidade_de_trabalho)


def obter_resumir_investimentos(
    unidade_de_trabalho: UnidadeDeTrabalhoPropria,
) -> ResumirInvestimentos:
    return ResumirInvestimentos(unidade_de_trabalho)


def obter_consultar_historico_de_investimentos(
    unidade_de_trabalho: UnidadeDeTrabalhoPropria,
) -> ConsultarHistoricoDeInvestimentos:
    return ConsultarHistoricoDeInvestimentos(unidade_de_trabalho)


def obter_realocar_destinacao(unidade_de_trabalho: UnidadeDeTrabalhoPropria) -> RealocarDestinacao:
    return RealocarDestinacao(unidade_de_trabalho)


def obter_listar_realocacoes(unidade_de_trabalho: UnidadeDeTrabalhoPropria) -> ListarRealocacoes:
    return ListarRealocacoes(unidade_de_trabalho)


def obter_remover_caixinhas_do_resgate(
    unidade_de_trabalho: UnidadeDeTrabalhoPropria,
) -> RemoverCaixinhasDoResgate:
    return RemoverCaixinhasDoResgate(unidade_de_trabalho)


def obter_associar_movimento_ao_investimento(
    unidade_de_trabalho: UnidadeDeTrabalhoPropria,
) -> AssociarMovimentoAoInvestimento:
    return AssociarMovimentoAoInvestimento(unidade_de_trabalho)


def obter_definir_destinacoes_do_investimento(
    unidade_de_trabalho: UnidadeDeTrabalhoPropria, relogio: RelogioDaApp
) -> DefinirDestinacoesDoInvestimento:
    return DefinirDestinacoesDoInvestimento(unidade_de_trabalho, relogio)


def obter_desfazer_realocacao(unidade_de_trabalho: UnidadeDeTrabalhoPropria) -> DesfazerRealocacao:
    return DesfazerRealocacao(unidade_de_trabalho)


def obter_desfazer_saldo_inicial(
    unidade_de_trabalho: UnidadeDeTrabalhoPropria,
) -> DesfazerSaldoInicial:
    return DesfazerSaldoInicial(unidade_de_trabalho)


def obter_listar_movimentos_de_investimento(
    unidade_de_trabalho: UnidadeDeTrabalhoPropria,
) -> ListarMovimentosDeInvestimento:
    return ListarMovimentosDeInvestimento(unidade_de_trabalho)


def obter_aceitar_transacao_importada_dividida(
    unidade_de_trabalho: UnidadeDeTrabalhoPropria,
) -> AceitarTransacaoImportadaDividida:
    return AceitarTransacaoImportadaDividida(unidade_de_trabalho)


def obter_verificar_gestao_de_investimentos(
    unidade_de_trabalho: UnidadeDeTrabalhoPropria,
) -> VerificarGestaoDeInvestimentos:
    return VerificarGestaoDeInvestimentos(unidade_de_trabalho)


def obter_desfazer_classificacao_de_investimento(
    unidade_de_trabalho: UnidadeDeTrabalhoPropria,
) -> DesfazerClassificacaoDeInvestimento:
    return DesfazerClassificacaoDeInvestimento(unidade_de_trabalho)


def obter_associar_compra_a_destinacao(
    unidade_de_trabalho: UnidadeDeTrabalhoPropria,
) -> AssociarCompraADestinacao:
    return AssociarCompraADestinacao(unidade_de_trabalho)


def obter_desassociar_compra_da_destinacao(
    unidade_de_trabalho: UnidadeDeTrabalhoPropria,
) -> DesassociarCompraDaDestinacao:
    return DesassociarCompraDaDestinacao(unidade_de_trabalho)


def obter_listar_reservas_das_destinacoes(
    unidade_de_trabalho: UnidadeDeTrabalhoPropria,
) -> ListarReservasDasDestinacoes:
    return ListarReservasDasDestinacoes(unidade_de_trabalho)


def obter_listar_pendencias_de_revisao(
    unidade_de_trabalho: UnidadeDeTrabalhoPropria,
) -> ListarPendenciasDeRevisao:
    return ListarPendenciasDeRevisao(unidade_de_trabalho)


def obter_revisar_aporte(unidade_de_trabalho: UnidadeDeTrabalhoPropria) -> RevisarAporte:
    return RevisarAporte(unidade_de_trabalho)


def obter_revisar_gasto_legado(unidade_de_trabalho: UnidadeDeTrabalhoPropria) -> RevisarGastoLegado:
    return RevisarGastoLegado(unidade_de_trabalho)


def obter_revisar_recorrencia_legada(
    unidade_de_trabalho: UnidadeDeTrabalhoPropria,
) -> RevisarRecorrenciaLegada:
    return RevisarRecorrenciaLegada(unidade_de_trabalho)


def obter_definir_cor_da_destinacao(
    unidade_de_trabalho: UnidadeDeTrabalhoPropria,
) -> DefinirCorDaDestinacao:
    return DefinirCorDaDestinacao(unidade_de_trabalho)


def obter_remover_cor_da_destinacao(
    unidade_de_trabalho: UnidadeDeTrabalhoPropria,
) -> RemoverCorDaDestinacao:
    return RemoverCorDaDestinacao(unidade_de_trabalho)


def obter_listar_resgates_sem_destinacao(
    unidade_de_trabalho: UnidadeDeTrabalhoPropria,
) -> ListarResgatesSemDestinacao:
    return ListarResgatesSemDestinacao(unidade_de_trabalho)


def obter_reclassificar_transacao_importada(
    unidade_de_trabalho: UnidadeDeTrabalhoPropria,
) -> ReclassificarTransacaoImportada:
    return ReclassificarTransacaoImportada(unidade_de_trabalho)


def obter_desfazer_classificacao_importada(
    unidade_de_trabalho: UnidadeDeTrabalhoPropria,
) -> DesfazerClassificacaoImportada:
    return DesfazerClassificacaoImportada(unidade_de_trabalho)


def obter_consultar_impacto_da_reversao(
    unidade_de_trabalho: UnidadeDeTrabalhoPropria,
) -> ConsultarImpactoDaReversao:
    return ConsultarImpactoDaReversao(unidade_de_trabalho)


def obter_classificar_transferencia(
    unidade_de_trabalho: UnidadeDeTrabalhoPropria,
) -> ClassificarTransferencia:
    return ClassificarTransferencia(unidade_de_trabalho)


def obter_completar_par_da_transferencia(
    unidade_de_trabalho: UnidadeDeTrabalhoPropria,
) -> CompletarParDaTransferencia:
    return CompletarParDaTransferencia(unidade_de_trabalho)


def obter_definir_papel_da_conta(
    unidade_de_trabalho: UnidadeDeTrabalhoPropria,
) -> DefinirPapelDaConta:
    return DefinirPapelDaConta(unidade_de_trabalho)


def obter_definir_apelido_da_conta(
    unidade_de_trabalho: UnidadeDeTrabalhoPropria,
) -> DefinirApelidoDaConta:
    return DefinirApelidoDaConta(unidade_de_trabalho)


def obter_remover_apelido_da_conta(
    unidade_de_trabalho: UnidadeDeTrabalhoPropria,
) -> RemoverApelidoDaConta:
    return RemoverApelidoDaConta(unidade_de_trabalho)


def obter_listar_transferencias(
    unidade_de_trabalho: UnidadeDeTrabalhoPropria,
) -> ListarTransferencias:
    return ListarTransferencias(unidade_de_trabalho)


def obter_definir_caixinha(unidade_de_trabalho: UnidadeDeTrabalhoPropria) -> DefinirCaixinha:
    return DefinirCaixinha(unidade_de_trabalho)


def obter_definir_referencia_da_caixinha(
    unidade_de_trabalho: UnidadeDeTrabalhoPropria,
) -> DefinirReferenciaDaCaixinha:
    return DefinirReferenciaDaCaixinha(unidade_de_trabalho)


def obter_consultar_reconciliacao_da_caixinha(
    unidade_de_trabalho: UnidadeDeTrabalhoPropria,
) -> ConsultarReconciliacaoDaCaixinha:
    return ConsultarReconciliacaoDaCaixinha(unidade_de_trabalho)


def obter_diagnosticar_contabilidade(
    unidade_de_trabalho: UnidadeDeTrabalhoPropria,
) -> DiagnosticarContabilidade:
    return DiagnosticarContabilidade(unidade_de_trabalho)


def obter_listar_historico_de_metas(
    unidade_de_trabalho: UnidadeDeTrabalhoPropria,
) -> ListarHistoricoDeMetas:
    return ListarHistoricoDeMetas(unidade_de_trabalho)


def obter_listar_aportes_sem_investimento(
    unidade_de_trabalho: UnidadeDeTrabalhoPropria,
) -> ListarAportesSemInvestimento:
    return ListarAportesSemInvestimento(unidade_de_trabalho)


def obter_mesclar_aporte(
    unidade_de_trabalho: UnidadeDeTrabalhoPropria, request: Request
) -> MesclarAporteSemInvestimento:
    return MesclarAporteSemInvestimento(unidade_de_trabalho, request.app.state.relogio)


def obter_excluir_aporte(
    unidade_de_trabalho: UnidadeDeTrabalhoPropria, request: Request
) -> ExcluirAporteSemInvestimento:
    return ExcluirAporteSemInvestimento(unidade_de_trabalho, request.app.state.relogio)


def obter_desfazer_tratamento_de_aporte(
    unidade_de_trabalho: UnidadeDeTrabalhoPropria, request: Request
) -> DesfazerTratamentoDeAporte:
    return DesfazerTratamentoDeAporte(unidade_de_trabalho, request.app.state.relogio)


def obter_aprovar_tratamentos_de_aporte(
    unidade_de_trabalho: UnidadeDeTrabalhoPropria, request: Request
) -> AprovarTratamentosDeAporte:
    return AprovarTratamentosDeAporte(unidade_de_trabalho, request.app.state.relogio)


def obter_alocar_caixinha(unidade_de_trabalho: UnidadeDeTrabalhoPropria) -> AlocarCaixinha:
    return AlocarCaixinha(unidade_de_trabalho)


def obter_listar_operacoes(unidade_de_trabalho: UnidadeDeTrabalhoPropria) -> ListarOperacoes:
    return ListarOperacoes(unidade_de_trabalho)


def obter_lancar_operacao_manual(
    unidade_de_trabalho: UnidadeDeTrabalhoPropria,
) -> LancarOperacaoManual:
    return LancarOperacaoManual(unidade_de_trabalho)


def obter_alterar_operacao(unidade_de_trabalho: UnidadeDeTrabalhoPropria) -> AlterarOperacao:
    return AlterarOperacao(unidade_de_trabalho)


def obter_excluir_operacao(unidade_de_trabalho: UnidadeDeTrabalhoPropria) -> ExcluirOperacao:
    return ExcluirOperacao(unidade_de_trabalho)


def obter_desfazer_casamento(unidade_de_trabalho: UnidadeDeTrabalhoPropria) -> DesfazerCasamento:
    return DesfazerCasamento(unidade_de_trabalho)


def obter_confirmar_reaplicacao_de_resgate(
    unidade_de_trabalho: UnidadeDeTrabalhoPropria,
) -> ConfirmarReaplicacaoDeResgate:
    return ConfirmarReaplicacaoDeResgate(unidade_de_trabalho)


def obter_remover_reaplicacao_de_resgate(
    unidade_de_trabalho: UnidadeDeTrabalhoPropria,
) -> RemoverReaplicacaoDeResgate:
    return RemoverReaplicacaoDeResgate(unidade_de_trabalho)


def obter_listar_reaplicacoes_de_resgates(
    unidade_de_trabalho: UnidadeDeTrabalhoPropria,
) -> ListarReaplicacoesDeResgates:
    return ListarReaplicacoesDeResgates(unidade_de_trabalho)


def obter_listar_resgates_para_reaplicar(
    unidade_de_trabalho: UnidadeDeTrabalhoPropria,
) -> ListarResgatesParaReaplicar:
    return ListarResgatesParaReaplicar(unidade_de_trabalho)


def obter_classificar_natureza_do_resgate(
    unidade: UnidadeDeTrabalhoPropria,
) -> ClassificarNaturezaDoResgate:
    return ClassificarNaturezaDoResgate(unidade)


def obter_sugerir_reaplicacao(unidade_de_trabalho: UnidadeDeTrabalhoPropria):
    from gastoba.application.sugerir_reaplicacao import SugerirReaplicacao

    return SugerirReaplicacao(unidade_de_trabalho)


def obter_listar_casamentos(unidade_de_trabalho: UnidadeDeTrabalhoPropria):
    from gastoba.application.listar_casamentos import ListarCasamentos

    return ListarCasamentos(unidade_de_trabalho)


def obter_listar_revisao_da_bolsa(unidade_de_trabalho: UnidadeDeTrabalhoPropria):
    from gastoba.application.listar_revisao_da_bolsa import ListarRevisaoDaBolsa

    return ListarRevisaoDaBolsa(unidade_de_trabalho)


def obter_confirmar_propostas_da_bolsa(unidade_de_trabalho: UnidadeDeTrabalhoPropria):
    from gastoba.application.confirmar_propostas_da_bolsa import ConfirmarPropostasDaBolsa

    return ConfirmarPropostasDaBolsa(unidade_de_trabalho)


def obter_trocar_gasto_pela_ligacao(unidade_de_trabalho: UnidadeDeTrabalhoPropria):
    from gastoba.application.trocar_gasto_pela_ligacao import TrocarGastoPelaLigacao

    return TrocarGastoPelaLigacao(unidade_de_trabalho)


def obter_refazer_casamento(unidade_de_trabalho: UnidadeDeTrabalhoPropria):
    from gastoba.application.refazer_casamento import RefazerCasamento

    return RefazerCasamento(unidade_de_trabalho)
