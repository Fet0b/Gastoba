"""Popula um banco SQLite **vazio** com dados fictícios, pelo caminho real do sistema.

Composition root de teste (como ``gastoba.administracao``): monta as implementações concretas e
chama casos de uso; não tem regra de negócio. Os dados bancários e de investimento entram pela
sincronização real, lendo arquivos no formato da Pluggy por HTTP simulado. Todo o resto
(classificações, metas, recorrências, destinações etc.) é criado pelos casos de uso, nunca por SQL.
"""

import importlib.util
import os
import tempfile
from collections.abc import Mapping
from dataclasses import dataclass
from datetime import UTC, date, datetime, time, timedelta
from decimal import Decimal
from pathlib import Path
from uuid import UUID, uuid4

from alembic import command
from alembic.config import Config
from sqlalchemy import Engine, make_url, text

from dados_de_teste.transporte_simulado import ITEM_DO_CENARIO, criar_cliente_simulado
from gastoba.application.aceitar_transacao_importada import AceitarTransacaoImportada
from gastoba.application.aceitar_transacao_importada_dividida import (
    AceitarTransacaoImportadaDividida,
)
from gastoba.application.aceitar_transacoes_importadas_em_lote import (
    AceitarTransacoesImportadasEmLote,
)
from gastoba.application.alocar_caixinha import AlocarCaixinha
from gastoba.application.associar_compra_a_destinacao import AssociarCompraADestinacao
from gastoba.application.cadastrar_usuario import CadastrarUsuario
from gastoba.application.classificar_transferencia import ClassificarTransferencia
from gastoba.application.confirmar_propostas_da_bolsa import (
    ConfirmarPropostasDaBolsa,
    ItemDeConfirmacao,
)
from gastoba.application.confirmar_reaplicacao_de_resgate import ConfirmarReaplicacaoDeResgate
from gastoba.application.criar_chave_de_api import CriarChaveDeApi
from gastoba.application.criar_conta import CriarConta
from gastoba.application.criar_recorrencia import CriarRecorrencia
from gastoba.application.definir_aparencia import DefinirAparencia
from gastoba.application.definir_apelido_da_conta import DefinirApelidoDaConta
from gastoba.application.definir_caixinha import DefinirCaixinha
from gastoba.application.definir_cor_da_destinacao import DefinirCorDaDestinacao
from gastoba.application.definir_destinacoes_do_investimento import (
    DefinirDestinacoesDoInvestimento,
)
from gastoba.application.definir_guardado_nas_metas import DefinirGuardadoNasMetas
from gastoba.application.definir_meta import DefinirMeta
from gastoba.application.definir_papel_da_conta import DefinirPapelDaConta
from gastoba.application.definir_referencia_da_caixinha import DefinirReferenciaDaCaixinha
from gastoba.application.definir_renda_base import DefinirRendaBase
from gastoba.application.desfazer_classificacao_importada import DesfazerClassificacaoImportada
from gastoba.application.encerrar_recorrencia import EncerrarRecorrencia
from gastoba.application.ignorar_transacao_importada import IgnorarTransacaoImportada
from gastoba.application.lancar_operacao_manual import LancarOperacaoManual
from gastoba.application.listar_revisao_da_bolsa import ListarRevisaoDaBolsa
from gastoba.application.listar_transacoes_importadas import ListarTransacoesImportadas
from gastoba.application.processar_recorrencias import ProcessarRecorrencias
from gastoba.application.realocar_destinacao import RealocarDestinacao
from gastoba.application.registrar_ganho import RegistrarGanho
from gastoba.application.registrar_gasto import RegistrarGasto
from gastoba.application.restaurar_transacao_importada import RestaurarTransacaoImportada
from gastoba.application.sincronizar_contas_bancarias import SincronizarContasBancarias
from gastoba.domain.aparencia import IntensidadeDaCor, MarcaDoApp, TexturaDoFundo
from gastoba.domain.caixinha_marcada import CaixinhaMarcada
from gastoba.domain.categoria import CategoriaDoGasto
from gastoba.domain.chave_de_api import EscopoDaChave
from gastoba.domain.conta import PapelDaConta, TipoDaConta
from gastoba.domain.cor_da_destinacao import CorDaDestinacao
from gastoba.domain.destinacao import Destinacao
from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.divisao_da_transacao import ParteDaTransacao
from gastoba.domain.email import Email
from gastoba.domain.fatura import Fatura, FonteDaFatura, atribuir_ciclo, estimar_faturas
from gastoba.domain.mes import Mes, hoje_no_fuso_do_negocio
from gastoba.domain.meta import AlvoDaMeta
from gastoba.domain.movimento_de_investimento import TipoDeMovimento
from gastoba.domain.operacao import TipoDeOperacao
from gastoba.domain.recorrencia import TipoDeRecorrencia
from gastoba.domain.tag import Tag
from gastoba.domain.transacao_importada import (
    EstadoDaTransacaoImportada,
    MotivoDaTransacaoIgnorada,
)
from gastoba.infrastructure.configuracoes import obter_configuracoes
from gastoba.infrastructure.persistencia.banco import criar_engine, criar_fabrica_de_sessoes
from gastoba.infrastructure.persistencia.unidade_de_trabalho import UnidadeDeTrabalhoSqlAlchemy
from gastoba.infrastructure.pluggy.provedor_pluggy import ProvedorPluggy
from gastoba.infrastructure.seguranca.gerador_de_segredo_seguro import GeradorDeSegredoSeguro
from gastoba.infrastructure.seguranca.hasher_de_senha_scrypt import HasherDeSenhaScrypt

VARIAVEL_DO_AMBIENTE_DE_TESTE = "GASTOBA_AMBIENTE_DE_TESTE"
EMAIL_DA_DONA = "teste@exemplo.com"
EMAIL_DA_OUTRA_PESSOA = "outra@exemplo.com"
# Credencial fictícia: existe só no ambiente de teste e está documentada.
SENHA_DE_TESTE = "senha-de-teste-123"
DIAS_INICIAIS_DA_SINCRONIZACAO = 130
DIA_DE_FECHAMENTO = 10
INTERVALO_ATE_O_VENCIMENTO = 7
RAIZ_DO_BACKEND = Path(__file__).resolve().parents[1]
VOLUME_DE_TESTE = Path("/dados-de-teste")
NOMES_DE_BANCO_PROTEGIDOS = ("gastobs.db",)
PASTAS_DE_BANCO_PROTEGIDAS = (Path("/dados"),)


C = CategoriaDoGasto
REGRAS_DE_CATEGORIA = (
    ("SUPERMERCADO", C.CONFORTO, ("mercado", "cartão")),
    ("MERCADO", C.CONFORTO, ("mercado", "pix")),
    ("FARMACIA", C.CONFORTO, ("saúde",)),
    ("PADARIA", C.CONFORTO, ("padaria",)),
    ("COMBUSTIVEL", C.CONFORTO, ("carro",)),
    ("ROUPAS", C.CONFORTO, ("roupas",)),
    ("TRANSPORTE", C.CONFORTO, ("transporte",)),
    ("ELETRO", C.CONFORTO, ("casa", "parcelado")),
    ("ALUGUEL", C.GASTO_FIXO, ("moradia", "boleto")),
    ("LUZ", C.GASTO_FIXO, ("contas", "boleto")),
    ("INTERNET", C.GASTO_FIXO, ("contas",)),
    ("STREAMING", C.GASTO_FIXO, ("assinatura",)),
    ("ACADEMIA", C.GASTO_FIXO, ("saúde", "assinatura")),
    ("RESTAURANTE", C.LAZER, ("restaurante", "pix")),
    ("CINE", C.LAZER, ("cinema",)),
    ("LIVRARIA", C.CONHECIMENTO, ("livros",)),
    ("CURSO", C.CONHECIMENTO, ("cursos", "pix")),
)


class PopulacaoRecusada(Exception):
    """Uma guarda impediu a população; nada foi escrito."""


class RelogioFixo:
    """Satisfaz a porta Relogio: a tarde de ``hoje`` em UTC, para o resultado ser reproduzível."""

    def __init__(self, hoje: date) -> None:
        self._instante = datetime.combine(hoje, time(15, 0), tzinfo=UTC)

    def agora(self) -> datetime:
        return self._instante


@dataclass(frozen=True, slots=True)
class ResultadoDaPopulacao:
    contagens: dict[str, int]
    populou: bool


def D(valor: str) -> Dinheiro:  # noqa: N802 - atalho curto para os valores do cenário
    return Dinheiro.de_reais(valor)


def hoje_do_negocio() -> date:
    return hoje_no_fuso_do_negocio(datetime.now(UTC))


def _caminho_do_banco(url_banco: str) -> Path:
    url = make_url(url_banco)
    if url.get_backend_name() != "sqlite" or url.database in (None, "", ":memory:"):
        raise PopulacaoRecusada("O banco de teste precisa ser um SQLite em arquivo.")
    return Path(url.database).resolve()


def _dentro_de(caminho: Path, pasta: Path) -> bool:
    return caminho.is_relative_to(pasta.resolve())


def verificar_guardas_de_ambiente(url_banco: str, ambiente: Mapping[str, str]) -> Path:
    """Guardas que valem antes de abrir o banco; devolve o caminho do arquivo."""
    if ambiente.get(VARIAVEL_DO_AMBIENTE_DE_TESTE) != "true":
        raise PopulacaoRecusada(
            f"Defina {VARIAVEL_DO_AMBIENTE_DE_TESTE}=true para confirmar que este é um ambiente "
            "de teste."
        )
    caminho = _caminho_do_banco(url_banco)
    permitido = _dentro_de(caminho, VOLUME_DE_TESTE) or _dentro_de(
        caminho, Path(tempfile.gettempdir())
    )
    if not permitido and (
        caminho.name in NOMES_DE_BANCO_PROTEGIDOS
        or any(_dentro_de(caminho, pasta) for pasta in PASTAS_DE_BANCO_PROTEGIDAS)
    ):
        raise PopulacaoRecusada(
            "Este caminho é o de um banco de desenvolvimento ou de produção; use um banco de teste."
        )
    return caminho


def _tabela_existe(engine: Engine, nome: str) -> bool:
    with engine.connect() as conexao:
        return (
            conexao.execute(
                text("SELECT 1 FROM sqlite_master WHERE type='table' AND name=:nome"),
                {"nome": nome},
            ).first()
            is not None
        )


def _contar_usuarios(engine: Engine) -> int:
    if not _tabela_existe(engine, "usuarios"):
        return 0
    with engine.connect() as conexao:
        return int(conexao.execute(text("SELECT COUNT(*) FROM usuarios")).scalar_one())


def aplicar_migrations(url_banco: str) -> None:
    """``alembic upgrade head`` no banco de teste (o ``env.py`` lê a URL das configurações)."""
    anterior = os.environ.get("GASTOBA_URL_BANCO")
    os.environ["GASTOBA_URL_BANCO"] = url_banco
    obter_configuracoes.cache_clear()
    try:
        # Sem o alembic.ini: o ``env.py`` só chama ``fileConfig`` quando há arquivo, e isso
        # desligaria os registros de log do processo que chama (os testes, por exemplo).
        configuracao = Config()
        configuracao.set_main_option("script_location", str(RAIZ_DO_BACKEND / "migrations"))
        command.upgrade(configuracao, "head")
    finally:
        if anterior is None:
            os.environ.pop("GASTOBA_URL_BANCO", None)
        else:
            os.environ["GASTOBA_URL_BANCO"] = anterior
        obter_configuracoes.cache_clear()


def contar_por_tabela(engine: Engine) -> dict[str, int]:
    with engine.connect() as conexao:
        tabelas = [
            linha[0]
            for linha in conexao.execute(
                text(
                    "SELECT name FROM sqlite_master WHERE type='table' "
                    "AND name NOT LIKE 'sqlite_%' AND name <> 'alembic_version' ORDER BY name"
                )
            )
        ]
        # Os nomes vêm do próprio catálogo do SQLite, nunca de entrada externa.
        return {
            t: int(conexao.execute(text(f'SELECT COUNT(*) FROM "{t}"')).scalar_one())
            for t in tabelas
        }


def popular(
    url_banco: str,
    hoje: date | None = None,
    *,
    ambiente: Mapping[str, str] | None = None,
    se_vazio: bool = False,
) -> ResultadoDaPopulacao:
    """Popula o banco de teste. Recusa (``PopulacaoRecusada``) antes de escrever qualquer coisa
    se o ambiente não for de teste, se o banco for protegido ou se já houver usuário."""
    ambiente = os.environ if ambiente is None else ambiente
    hoje = hoje or hoje_do_negocio()
    verificar_guardas_de_ambiente(url_banco, ambiente)
    engine = criar_engine(url_banco)
    try:
        if _contar_usuarios(engine) > 0:
            if se_vazio:
                return ResultadoDaPopulacao(contar_por_tabela(engine), populou=False)
            raise PopulacaoRecusada(
                "O banco já tem usuários. Para recriar do zero, apague o banco de teste "
                "(docker compose -f compose.teste.yaml down -v) e popule de novo."
            )
        aplicar_migrations(url_banco)
        _Roteiro(engine, hoje).executar()
        return ResultadoDaPopulacao(contar_por_tabela(engine), populou=True)
    finally:
        engine.dispose()


class _Roteiro:
    def __init__(self, engine: Engine, hoje: date) -> None:
        self._fabrica = criar_fabrica_de_sessoes(engine)
        self._hoje = hoje
        self._relogio = RelogioFixo(hoje)

    def uow(self) -> UnidadeDeTrabalhoSqlAlchemy:
        return UnidadeDeTrabalhoSqlAlchemy(self._fabrica)

    def sincronizador(self) -> SincronizarContasBancarias:
        provedor = ProvedorPluggy(
            "id-ficticio", "segredo-ficticio", cliente=criar_cliente_simulado(self._hoje)
        )
        return SincronizarContasBancarias(
            self.uow(),
            provedor,
            self._relogio,
            (ITEM_DO_CENARIO,),
            EMAIL_DA_DONA,
            DIAS_INICIAIS_DA_SINCRONIZACAO,
        )

    def executar(self) -> None:
        hasher = HasherDeSenhaScrypt()
        cadastrar = CadastrarUsuario(self.uow(), hasher, cadastro_aberto=True)
        cadastrar.executar("Pessoa de Teste", EMAIL_DA_DONA, SENHA_DE_TESTE)
        cadastrar.executar("Outra Pessoa", EMAIL_DA_OUTRA_PESSOA, SENHA_DE_TESTE)
        resultado = self.sincronizador().executar()
        if resultado.falhas:
            raise RuntimeError("A sincronização do cenário falhou.")
        with self.uow() as uow:
            self.dona = uow.usuarios.obter_por_email(Email.de_texto(EMAIL_DA_DONA)).id
            self.outra = uow.usuarios.obter_por_email(Email.de_texto(EMAIL_DA_OUTRA_PESSOA)).id
        self._outra_pessoa()
        self._dados_manuais()
        self._metas_e_renda()
        self._contas_e_investimentos()
        self._caixa_de_entrada()
        self._bolsa_e_renda_fixa()
        self._vencimento_e_rendimento()
        self._compras_e_reaplicacao()
        self._desfazer_e_restaurar()
        self._configuracoes()
        self._faturas_estimadas()

    # --- apoio ---

    def dia(self, dias_atras: int) -> date:
        return self._hoje - timedelta(days=dias_atras)

    def conta(self, usuario_id: UUID, nome: str):
        with self.uow() as uow:
            return next(c for c in uow.contas.listar(usuario_id) if c.nome == nome)

    def posicoes(self) -> dict[str, object]:
        with self.uow() as uow:
            return {p.id_externo: p for p in uow.investimentos.listar_posicoes(self.dona)}

    def caixa(self, estado=EstadoDaTransacaoImportada.PENDENTE) -> list:
        return [
            i.transacao for i in ListarTransacoesImportadas(self.uow()).executar(self.dona, estado)
        ]

    def transacao(self, trecho: str, estado=EstadoDaTransacaoImportada.PENDENTE):
        achadas = [t for t in self.caixa(estado) if trecho in t.descricao]
        if len(achadas) != 1:
            raise RuntimeError(f"O cenário esperava uma transação ({trecho!r}): {len(achadas)}.")
        return achadas[0]

    def aceitar(self, trecho: str, categoria=None, tags=(), **kwargs):
        t = self.transacao(trecho)
        return AceitarTransacaoImportada(self.uow()).executar(
            self.dona, t.id, categoria, list(tags), **kwargs
        )

    # --- a outra pessoa (isolamento) ---

    def _outra_pessoa(self) -> None:
        conta = CriarConta(self.uow()).executar(self.outra, "Carteira da outra pessoa", D("300.00"))
        gasto = RegistrarGasto(self.uow())
        gasto.executar(
            self.outra,
            conta.id,
            D("42.00"),
            "Almoço",
            self.dia(0),
            CategoriaDoGasto.LAZER,
            ["almoço"],
        )
        gasto.executar(
            self.outra, conta.id, D("65.30"), "Mercado", self.dia(1), CategoriaDoGasto.CONFORTO, []
        )
        RegistrarGanho(self.uow()).executar(
            self.outra, conta.id, D("500.00"), "Presente", self.dia(2), []
        )
        DefinirMeta(self.uow(), self._relogio).executar(self.outra, AlvoDaMeta.LAZER, 20)

    # --- dados manuais da dona ---

    def _dados_manuais(self) -> None:
        carteira = CriarConta(self.uow()).executar(self.dona, "Carteira (manual)", D("1500.00"))
        self.carteira = carteira
        gasto = RegistrarGasto(self.uow())
        for dias, valor, desc, cat, tags in [
            (0, "12.50", "Café da manhã", CategoriaDoGasto.LAZER, ["dinheiro"]),
            (0, "23.90", "Transporte por aplicativo", CategoriaDoGasto.CONFORTO, ["transporte"]),
            (1, "180.00", "Ingresso de show", CategoriaDoGasto.LAZER, ["show"]),
            (2, "220.00", "Curso de inglês", CategoriaDoGasto.CONHECIMENTO, ["cursos"]),
            (4, "98.10", "Conta de água", CategoriaDoGasto.GASTO_FIXO, ["contas"]),
            (35, "75.00", "Cinema com amigos", CategoriaDoGasto.LAZER, ["cinema"]),
            (50, "310.00", "Material de estudo", CategoriaDoGasto.CONHECIMENTO, ["livros"]),
        ]:
            gasto.executar(self.dona, carteira.id, D(valor), desc, self.dia(dias), cat, tags)
        self.passagem = gasto.executar(
            self.dona,
            carteira.id,
            D("800.00"),
            "Passagem aérea",
            self.dia(8),
            CategoriaDoGasto.LAZER,
            ["viagem"],
        )
        ganho = RegistrarGanho(self.uow())
        ganho.executar(
            self.dona, carteira.id, D("250.00"), "Venda de item usado", self.dia(3), ["extra"]
        )
        ganho.executar(
            self.dona, carteira.id, D("320.00"), "Reembolso da empresa", self.dia(12), []
        )
        criar = CriarRecorrencia(self.uow(), self._relogio)
        criar.executar(
            self.dona, TipoDeRecorrencia.GANHO, carteira.id, D("1500.00"), "Freela mensal",
            1, self.dia(90), None, ["freela"], None,
        )  # fmt: skip
        criar.executar(
            self.dona, TipoDeRecorrencia.GASTO, carteira.id, D("39.90"), "Assinatura de streaming",
            1, self.dia(90), CategoriaDoGasto.GASTO_FIXO, ["assinatura"], None,
        )  # fmt: skip
        # Dia 31 (em mês curto vale o último dia) e uma recorrência já encerrada.
        criar.executar(
            self.dona, TipoDeRecorrencia.GASTO, carteira.id, D("640.00"), "Condomínio (dia 31)",
            31, self.dia(90), CategoriaDoGasto.GASTO_FIXO, ["moradia"], None,
        )  # fmt: skip
        encerrada = criar.executar(
            self.dona, TipoDeRecorrencia.GASTO, carteira.id, D("59.90"), "Plano antigo de academia",
            5, self.dia(120), CategoriaDoGasto.GASTO_FIXO, ["assinatura"], None,
        )  # fmt: skip
        EncerrarRecorrencia(self.uow()).executar(self.dona, encerrada.id)
        ProcessarRecorrencias(self.uow(), self._relogio).executar(self.dona)

    def _metas_e_renda(self) -> None:
        DefinirRendaBase(self.uow()).executar(self.dona, D("6500.00"))
        meta = DefinirMeta(self.uow(), self._relogio)
        for alvo, percentual in [
            (AlvoDaMeta.GASTO_FIXO, 30),
            (AlvoDaMeta.CONFORTO, 20),
            (AlvoDaMeta.LAZER, 15),
            (AlvoDaMeta.CONHECIMENTO, 10),
            (AlvoDaMeta.LIBERDADE_FINANCEIRA, 20),
        ]:
            meta.executar(self.dona, alvo, percentual)

    def _contas_e_investimentos(self) -> None:
        self.corrente = self.conta(self.dona, "Banco Exemplo Conta corrente")
        self.remunerada = self.conta(self.dona, "Banco Exemplo Conta remunerada")
        # Duas contas do mesmo banco: a primeira (com final) ganha um apelido; a outra, sem número,
        # fica só com o nome do banco (a pessoa a diferencia por apelido quando quiser).
        segunda = self.conta(self.dona, "Banco Exemplo Segunda conta")
        DefinirApelidoDaConta(self.uow()).executar(self.dona, segunda.id, "Conta da casa")
        papel = DefinirPapelDaConta(self.uow())
        papel.executar(self.dona, self.corrente.id, PapelDaConta.CORRENTE)
        papel.executar(self.dona, self.remunerada.id, PapelDaConta.INVESTIMENTO)
        # A conta remunerada vira a posição "conta investimentos", com o saldo do extrato.
        self.caixinha = DefinirCaixinha(self.uow()).executar(
            self.dona, self.remunerada.id, D("12000.00"), self.dia(0)
        )
        posicoes = self.posicoes()
        definir = DefinirDestinacoesDoInvestimento(self.uow(), self._relogio)
        for id_externo, destinos in {
            "inv-cdb-pos": [("reserva de emergência", 70), ("viagem", 30)],
            "inv-lci": [("casa", 100)],
            "inv-tesouro-longo": [("aposentadoria", 100)],
            "inv-tesouro-curto": [("carro", 100)],
            "inv-multimercado": [("viagem", 100)],
        }.items():
            definir.executar(
                self.dona,
                posicoes[id_externo].id,
                [Destinacao(Tag.de_texto(tag), pct) for tag, pct in destinos],
            )
        # O valor aplicado pelas operações do CDB (a compra inicial) é repartido entre caixinhas.
        AlocarCaixinha(self.uow()).executar(
            self.dona,
            posicoes["inv-cdb-pos"].id,
            [
                Destinacao(Tag.de_texto("reserva de emergência"), 60),
                Destinacao(Tag.de_texto("viagem"), 40),
            ],
        )
        # No CDB por fração, a realocação move o peso da caixinha (072, mudancas_de_fracao).
        RealocarDestinacao(self.uow()).executar(
            self.dona,
            posicoes["inv-cdb-pos"].id,
            "reserva de emergência",
            "viagem",
            self.dia(3),
            percentual=10,
        )
        # Numa posição sem fração, a realocação move o principal registrado (realocacoes).
        RealocarDestinacao(self.uow()).executar(
            self.dona,
            posicoes["inv-tesouro-longo"].id,
            "aposentadoria",
            "reserva de emergência",
            self.dia(3),
            percentual=10,
        )
        cores = DefinirCorDaDestinacao(self.uow())
        cores.executar(self.dona, "viagem", CorDaDestinacao.CEU)
        cores.executar(self.dona, "casa", CorDaDestinacao.AMBAR)

    def _historico_anterior(self) -> None:
        """Um segundo dia de histórico do fundo, antes do resgate: o resgate com caixinha abate o
        principal por custo médio (a sincronização só guarda o saldo do dia)."""
        with self.uow() as uow:
            fundo = next(
                i for i in uow.investimentos.listar(self.dona) if i.id_externo == "inv-multimercado"
            )
            uow.investimentos.salvar_posicao(self.dona, fundo, hoje=self.dia(20))
            uow.commit()

    def _caixa_de_entrada(self) -> None:
        self._historico_anterior()
        posicoes = self.posicoes()
        # Aportes e resgate com destinações (o valor se reparte entre caixinhas).
        self.aporte_lci = self.aceitar(
            "TED APLICACAO LCI",
            como_investimento=True,
            investimento_id=posicoes["inv-lci"].id,
            destinacoes=[Destinacao(Tag.de_texto("casa"), 100)],
        )
        self.aceitar(
            "TED APLICACAO TESOURO IPCA LONGO",
            como_investimento=True,
            investimento_id=posicoes["inv-tesouro-longo"].id,
            destinacoes=[Destinacao(Tag.de_texto("aposentadoria"), 100)],
        )
        self.resgate_multimercado = self.aceitar(
            "RESGATE FUNDO MULTIMERCADO",
            como_investimento=True,
            investimento_id=posicoes["inv-multimercado"].id,
            destinacoes=[Destinacao(Tag.de_texto("viagem"), 100)],
        )
        # Movimentos da conta investimentos: a aplicação e o resgate automáticos (os "espelhos") já
        # entram ignorados, como movimento interno da conta, e nunca passam pela caixa (071).
        for trecho in ("APLICACAO AUTOMATICA", "RESGATE AUTOMATICO"):
            self.transacao(trecho, EstadoDaTransacaoImportada.IGNORADA)
        # Aporte com "escolher depois": fica sem investimento (a pessoa associa mais tarde).
        self.aceitar("TED APLICACAO FUNDO A DEFINIR", como_investimento=True)
        # Transferência entre as próprias contas (as duas pontas, escolhidas pela pessoa).
        saida = self.transacao("PIX ENVIADO CORRETORA PROPRIA")
        entrada = self.transacao("PIX RECEBIDO CONTA CORRENTE PROPRIA")
        ClassificarTransferencia(self.uow()).executar(
            self.dona, saida.id, self.remunerada.id, entrada.id
        )
        # Dividir uma compra, aceitar em lote, ignorar.
        dividir = self.transacao("COMPRA ATACADO EXEMPLO DIVIDIR")
        AceitarTransacaoImportadaDividida(self.uow()).executar(
            self.dona,
            dividir.id,
            [
                ParteDaTransacao(CategoriaDoGasto.CONFORTO, (Tag.de_texto("mercado"),), 50),
                ParteDaTransacao(CategoriaDoGasto.LAZER, (Tag.de_texto("festa"),), 50),
            ],
        )
        lote = [t.id for t in self.caixa() if "PIX LANCHONETE LOTE" in t.descricao]
        AceitarTransacoesImportadasEmLote(self.uow()).executar(
            self.dona, lote, CategoriaDoGasto.LAZER, ["lanche"]
        )
        ignorar = IgnorarTransacaoImportada(self.uow())
        for trecho in ("ESTORNO COMPRA FARMACIA", "ESTORNO CINE EXEMPLO"):
            ignorar.executar(self.dona, self.transacao(trecho).id)
        ignorar.executar(
            self.dona,
            self.transacao("PIX ENVIADO CARTEIRA MANUAL PROPRIA").id,
            MotivoDaTransacaoIgnorada.TRANSFERENCIA_ENTRE_CONTAS,
        )
        # O resto, por palavra-chave. Fica pendente o que a bolsa, a renda fixa e a conta
        # remunerada ainda precisam tratar, mais algumas compras para a caixa nunca ficar vazia.
        deixar = (
            "LANCHONETE ESQUINA",
            "PET SHOP",
            "LIQ BOLSA",
            "CDB",
            "IRRF",
            "RENDIMENTO CONTA",
            "TESOURO PREFIXADO",
        )
        for t in self.caixa():
            if any(p in t.descricao for p in deixar):
                continue
            if t.sentido.value == "entrada":
                AceitarTransacaoImportada(self.uow()).executar(self.dona, t.id, None, ["salário"])
                continue
            for palavra, categoria, tags in REGRAS_DE_CATEGORIA:
                if palavra in t.descricao:
                    AceitarTransacaoImportada(self.uow()).executar(
                        self.dona, t.id, categoria, list(tags)
                    )
                    break
            else:
                raise RuntimeError("Uma transação do cenário ficou sem regra de categoria.")

    def _vencimento_e_rendimento(self) -> None:
        """O título vencido sem caixinhas (resgate, juros e imposto) e o rendimento da conta
        investimentos, tratados pela caixa sem usar "ignorar" (069, D1 e D2)."""
        posicao = self.posicoes()["inv-tesouro-pre"]
        resgate = self.aceitar(
            "RESGATE TESOURO PREFIXADO VENCIMENTO",
            como_investimento=True,
            investimento_id=posicao.id,
        )
        self.aceitar(
            "CREDITO TESOURO PREFIXADO JUROS",
            como_investimento=True,
            investimento_id=posicao.id,
            tipo_de_movimento=TipoDeMovimento.RENDIMENTO,
        )
        self.aceitar(
            "IRRF RESGATE TESOURO PREFIXADO",
            como_investimento=True,
            investimento_id=posicao.id,
            tipo_de_movimento=TipoDeMovimento.IMPOSTO,
            movimento_relacionado_id=resgate.id,
        )
        self.aceitar(
            "RENDIMENTO CONTA REMUNERADA",
            como_investimento=True,
            investimento_id=self.caixinha.id,
            tipo_de_movimento=TipoDeMovimento.RENDIMENTO,
        )

    def _desfazer_e_restaurar(self) -> None:
        """Um desfazer e um restaurar executados, e a pessoa decide de novo."""
        padaria = next(
            t for t in self.caixa(EstadoDaTransacaoImportada.ACEITA) if "PADARIA" in t.descricao
        )
        DesfazerClassificacaoImportada(self.uow()).executar(self.dona, padaria.id)
        self.aceitar("PADARIA", CategoriaDoGasto.CONFORTO, ["padaria"])
        estorno = self.transacao("ESTORNO CINE EXEMPLO", EstadoDaTransacaoImportada.IGNORADA)
        RestaurarTransacaoImportada(self.uow()).executar(self.dona, estorno.id)
        IgnorarTransacaoImportada(self.uow()).executar(self.dona, self.transacao("ESTORNO CINE").id)

    def _bolsa_e_renda_fixa(self) -> None:
        revisao = ListarRevisaoDaBolsa(self.uow()).executar(self.dona)
        exatas = [
            ItemDeConfirmacao(p.proposta.chave, p.versao)
            for p in revisao.propostas
            if p.proposta.confianca == "exata"
        ]
        ConfirmarPropostasDaBolsa(self.uow()).executar(self.dona, exatas)
        # Uma compra lançada à mão pela pessoa (a corretora não a informou).
        LancarOperacaoManual(self.uow()).executar(
            self.dona,
            self.posicoes()["inv-fii"].id,
            TipoDeOperacao.COMPRA,
            self.dia(2),
            Decimal("5"),
            D("570.00"),
        )

    def _compras_e_reaplicacao(self) -> None:
        # Parte da passagem aérea é paga com o resgate do fundo (cobertura da caixinha "viagem").
        AssociarCompraADestinacao(self.uow()).executar(
            self.dona,
            self.passagem.id,
            "viagem",
            D("400.00"),
            movimento_id=self.resgate_multimercado.id,
        )
        # Parte do resgate é reaplicada no aporte da LCI, feito depois dele.
        ConfirmarReaplicacaoDeResgate(self.uow()).executar(
            self.dona, self.aporte_lci.id, self.resgate_multimercado.id, D("1000.00")
        )

    def _configuracoes(self) -> None:
        # Aparência personalizada (065) e guardado nas metas (066): frentes já implementadas.
        DefinirAparencia(self.uow()).executar(
            self.dona,
            265,
            IntensidadeDaCor.MEDIA,
            TexturaDoFundo.PONTOS,
            "Meu Gastoba",
            MarcaDoApp.COFRE,
        )
        DefinirGuardadoNasMetas(self.uow()).executar(
            self.dona,
            True,
            [
                CaixinhaMarcada(CategoriaDoGasto.LAZER, Tag.de_texto("viagem")),
                CaixinhaMarcada(CategoriaDoGasto.CONFORTO, Tag.de_texto("carro")),
            ],
        )
        # Saldo de referência do mês passado da conta investimentos (o extrato confirmado).
        # O mês anterior de fato (30 dias atrás cairia no mesmo mês nos dias 30 e 31).
        mes_passado = date(self._hoje.year, self._hoje.month, 1) - timedelta(days=1)
        DefinirReferenciaDaCaixinha(self.uow()).executar(
            self.dona,
            self.caixinha.id,
            Mes(mes_passado.year, mes_passado.month),
            D("10200.00"),
            D("11700.00"),
            True,
        )
        # E o do mês atual (período ainda aberto), para a conferência não consultar um mês sem
        # referência: essa consulta responde 422, que a tela trata, mas é ruído nos erros do teste.
        DefinirReferenciaDaCaixinha(self.uow()).executar(
            self.dona,
            self.caixinha.id,
            Mes(self._hoje.year, self._hoje.month),
            D("11700.00"),
            D("12000.00"),
            False,
        )
        # Uma chave de API de leitura, só para a tela do perfil ter o que mostrar. O segredo
        # gerado não é guardado em lugar nenhum.
        CriarChaveDeApi(self.uow(), GeradorDeSegredoSeguro(), self._relogio).executar(
            self.dona, "Chave de exemplo", EscopoDaChave.LEITURA, None
        )
        self._estrategias_de_investimento()

    def _estrategias_de_investimento(self) -> None:
        """Ponto de extensão da frente 063 (estratégias de investimento), ainda não implementada.

        Quando ``gastoba.domain.estrategias`` existir, este é o lugar de definir a classe manual,
        os pesos e as notas, sempre pelos casos de uso. Hoje não há o que popular.
        """
        if importlib.util.find_spec("gastoba.domain.estrategias") is None:
            return
        raise NotImplementedError(
            "A frente 063 existe: complete este bloco do roteiro e a revisão de consistência."
        )

    def _faturas_estimadas(self) -> None:
        """Faturas estimadas pelas compras do cartão (a sincronização não lê ``/bills`` ainda).

        Usa a mesma função de domínio da estimativa e o repositório de faturas, sem SQL.
        """
        with self.uow() as uow:
            cartoes = [c for c in uow.contas.listar(self.dona) if c.tipo is TipoDaConta.CARTAO]
            for cartao in cartoes:
                compras = uow.faturas.compras_da_conta(cartao.id)
                fechamento = date(self._hoje.year, self._hoje.month, DIA_DE_FECHAMENTO)
                estimadas = estimar_faturas(
                    fechamento,
                    fechamento + timedelta(days=INTERVALO_ATE_O_VENCIMENTO),
                    compras,
                    uow.faturas.pagamentos_da_conta(cartao.id),
                    self._hoje,
                )
                faturas = [
                    Fatura(
                        id=uuid4(),
                        conta_id=cartao.id,
                        id_externo=None,
                        inicio=e.inicio,
                        fechamento=e.fechamento,
                        vencimento=e.vencimento,
                        total=e.total,
                        minimo=None,
                        pagamentos=e.pagamentos,
                        fonte=FonteDaFatura.ESTIMADA,
                    )
                    for e in estimadas
                ]
                for fatura in faturas:
                    uow.faturas.salvar(cartao.id, fatura)
                for compra in compras:
                    uow.faturas.vincular_compra(compra.id, atribuir_ciclo(compra, faturas))
            uow.commit()
