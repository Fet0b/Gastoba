"""Esquemas Pydantic de entrada e saída: o contrato OpenAPI consumido pelo frontend.

A API não expõe entidades do domain. Dinheiro trafega como string decimal (Art. III.3):
na entrada, ``StrictStr`` só nesse campo (número JSON vira 422); nunca ``strict=True`` no
modelo inteiro, que faria os campos ``UUID`` e ``date`` rejeitarem o texto vindo do JSON.
"""

from datetime import date, datetime
from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, Field, StrictInt, StrictStr

from gastoba.domain.aparencia import Aparencia, IntensidadeDaCor, MarcaDoApp, TexturaDoFundo
from gastoba.domain.categoria import CategoriaDoGasto
from gastoba.domain.chave_de_api import EscopoDaChave
from gastoba.domain.conta import PapelDaConta
from gastoba.domain.cor_da_destinacao import CorDaDestinacao
from gastoba.domain.destinacao_cadastrada import IconeDaCaixinha
from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.movimento_de_investimento import TipoDeMovimento
from gastoba.domain.recorrencia import TipoDeRecorrencia


def dinheiro_para_texto(dinheiro: Dinheiro) -> str:
    """Quantia como string decimal com duas casas (ex.: ``"25.90"``, ``"-10.00"``)."""
    return format(dinheiro.em_reais, "f")


class CriarContaRequisicao(BaseModel):
    nome: str
    saldo_inicial: StrictStr = "0.00"


class ContaResposta(BaseModel):
    papel: str | None = None
    id: UUID
    nome: str
    saldo: str
    origem: str
    tipo: str
    # Como a pessoa ve a conta: o apelido, senao o nome no banco, senao o nome.
    rotulo: str
    apelido: str | None = None
    nome_no_banco: str | None = None
    # So os quatro ultimos digitos do numero da conta.
    final_do_numero: str | None = None


class RegistrarGastoRequisicao(BaseModel):
    conta_id: UUID
    valor: StrictStr
    descricao: str
    data: date
    categoria: CategoriaDoGasto
    tags: list[str] = []


class CoberturaResposta(BaseModel):
    id: UUID
    tag: str
    valor: str
    movimento_id: UUID | None = None


class GastoResposta(BaseModel):
    transacao_importada_id: UUID | None = None
    valor_coberto: str
    coberturas: list[CoberturaResposta]
    id: UUID
    conta_id: UUID
    valor: str
    descricao: str
    data: date
    categoria: str
    tags: list[str]
    origem: str
    # Preenchido só no gasto gerado por uma recorrência.
    recorrencia_id: UUID | None = None


class FatiaPorTagResposta(BaseModel):
    """``tag`` é nula na fatia dos gastos sem tag."""

    tag: str | None
    valor: str


class ResumoPorTagsResposta(BaseModel):
    inicio: date
    fim: date
    total: str
    fatias: list[FatiaPorTagResposta]


class IgnorarTransacaoRequisicao(BaseModel):
    motivo: Literal["transferencia_entre_contas"] | None = None


class TransacaoImportadaResposta(BaseModel):
    motivo_ignorada: Literal["transferencia_entre_contas", "movimento_interno_da_conta"] | None = (
        None
    )
    tipo_de_movimento_sugerido: str | None = None
    id: UUID
    conta_id: UUID
    data: date
    descricao: str
    valor: str
    sentido: str
    tipo_de_operacao: str | None
    estado: str
    # Pagamento de fatura, transferência entre as próprias contas ou estorno.
    sugerir_descarte: bool
    # Já existe um lançamento manual da mesma conta, no mesmo dia e com o mesmo valor.
    possivel_duplicado: bool
    # A posição de investimento de que a saída parece ser o aporte (a emissão do título): mesmo
    # nome na descrição, mesmo valor aplicado e ainda sem movimento. Nulo sem sugestão.
    investimento_sugerido_id: UUID | None
    # A outra ponta provável de uma transferência entre contas próprias (nulo sem par inequívoco).
    par_sugerido_id: UUID | None = None
    # Aditivo (069): a transferência com uma só ponta que esta transação completaria (ou nulo).
    transferencia_sugerida_id: UUID | None = None
    # Aditivo (069): liquidação da bolsa; não é gasto nem ganho, liga-se na Revisão da bolsa.
    liquidacao_de_bolsa: bool = False


class DestinacaoRequisicao(BaseModel):
    tag: str
    percentual: int


class AceitarTransacaoImportadaRequisicao(BaseModel):
    # Obrigatória na saída (vira gasto; com ``investimentos``, aporte); proibida na entrada.
    tipo_de_movimento: TipoDeMovimento | None = None
    movimento_relacionado_id: UUID | None = None
    categoria: CategoriaDoGasto | None = None
    tags: list[str] = []
    # A saída vira aporte e a entrada vira resgate, em vez de gasto e ganho; sem categoria nem tags.
    como_investimento: bool = False
    # Só com ``como_investimento``: o investimento e como repartir o valor (soma 100%).
    investimento_id: UUID | None = None
    destinacoes: list[DestinacaoRequisicao] = []


class AceiteResposta(BaseModel):
    tipo: str
    id: UUID


class AceitarEmLoteRequisicao(AceitarTransacaoImportadaRequisicao):
    # Todas com a mesma categoria e as mesmas tags; de 1 a 200 saídas pendentes.
    transacao_ids: list[UUID]


class AceitarEmLoteResposta(BaseModel):
    aceitas: list[AceiteResposta]


class SincronizacaoResposta(BaseModel):
    contas: int
    transacoes_novas: int
    falhas: int


class RegistrarGanhoRequisicao(BaseModel):
    conta_id: UUID
    valor: StrictStr
    descricao: str
    data: date
    tags: list[str] = []


class GanhoResposta(BaseModel):
    transacao_importada_id: UUID | None = None
    id: UUID
    conta_id: UUID
    valor: str
    descricao: str
    data: date
    tags: list[str]
    origem: str
    # Preenchido só no ganho gerado por uma recorrência.
    recorrencia_id: UUID | None = None


class CriarRecorrenciaRequisicao(BaseModel):
    tipo: TipoDeRecorrencia
    conta_id: UUID
    valor: StrictStr
    descricao: str
    dia_do_mes: StrictInt
    inicio: date
    categoria: CategoriaDoGasto | None = None
    tags: list[str] = []
    fim: date | None = None


class AlterarRecorrenciaRequisicao(BaseModel):
    valor: StrictStr
    descricao: str
    dia_do_mes: StrictInt
    categoria: CategoriaDoGasto | None = None
    tags: list[str] = []
    fim: date | None = None


class RecorrenciaResposta(BaseModel):
    id: UUID
    tipo: str
    conta_id: UUID
    valor: str
    descricao: str
    dia_do_mes: int
    inicio: date
    fim: date | None
    categoria: str | None
    tags: list[str]
    ativa: bool


class DefinirRendaBaseRequisicao(BaseModel):
    valor: StrictStr


class RendaBaseResposta(BaseModel):
    valor: str | None


class DefinirMetaRequisicao(BaseModel):
    percentual: StrictInt


class HistoricoDeMetaResposta(BaseModel):
    categoria: str
    nome: str
    acao: Literal["criada", "alterada", "removida"]
    percentual_anterior: int | None
    percentual_novo: int | None
    instante: datetime


class MetaResposta(BaseModel):
    nome: str
    categoria: str
    percentual: int


class CaixinhaDaMetaResposta(BaseModel):
    tag: str
    # O que a caixinha pagou de compras da categoria no mês (zero se só mostra a rentabilidade).
    valor: str
    rentabilidade: str | None = None


class ProgressoDaMetaResposta(BaseModel):
    nome: str
    categoria: str
    percentual: int
    limite: str
    gasto: str
    restante: str
    percentual_usado: int | None
    situacao: str
    # ``gasto`` é líquido; o card mostra ``gasto_bruto`` de ``limite`` + ``limite_adicional``.
    gasto_bruto: str
    limite_adicional: str
    caixinhas: list[CaixinhaDaMetaResposta] = []
    rentabilidade: str | None = None
    # Só exibição (066): o que foi guardado no mês nas caixinhas marcadas da categoria.
    guardado: str = "0.00"
    percentual_guardado: int = 0
    caixinhas_guardadas: list[str] = []


class ResumoDasMetasResposta(BaseModel):
    aportes_do_mes: str
    classificacoes_para_revisar: int = 0
    mes: str
    renda: str
    renda_base: str | None
    renda_de_referencia: str
    metas: list[ProgressoDaMetaResposta]


class CategoriaResposta(BaseModel):
    legada: bool
    codigo: str
    nome: str


class CadastroRequisicao(BaseModel):
    nome: str
    email: str
    senha: str


class EntrarRequisicao(BaseModel):
    email: str
    senha: str


class UsuarioResposta(BaseModel):
    id: UUID
    email: str | None
    nome: str


class CaixinhaMarcadaCorpo(BaseModel):
    categoria: StrictStr
    tag: StrictStr


class GuardadoNasMetasCorpo(BaseModel):
    """Entrada e saída de ``/guardado-nas-metas``; o limite de 20 é do domínio."""

    ativo: bool
    marcacoes: list[CaixinhaMarcadaCorpo] = Field(max_length=200)


class CriarDestinacaoCadastradaCorpo(BaseModel):
    nome: str
    # Texto para o domínio responder `icone_invalido`; a cor segue o enum (`requisicao_invalida`).
    icone: str | None = None
    cor: CorDaDestinacao | None = None


class DefinirIconeDaCaixinhaCorpo(BaseModel):
    icone: str | None


class DestinacaoCadastradaResposta(BaseModel):
    id: UUID
    nome: str
    icone: IconeDaCaixinha | None = None
    cor: CorDaDestinacao | None = None


class AparenciaResposta(BaseModel):
    matiz: int
    intensidade: IntensidadeDaCor
    textura: TexturaDoFundo
    nome: str
    marca: MarcaDoApp
    # Falso na aparência padrão (nada foi escolhido); a SPA então não troca nenhum token.
    personalizada: bool


def aparencia_para_resposta(aparencia: Aparencia) -> AparenciaResposta:
    return AparenciaResposta(
        matiz=aparencia.matiz,
        intensidade=aparencia.intensidade,
        textura=aparencia.textura,
        nome=aparencia.nome,
        marca=aparencia.marca,
        personalizada=aparencia != Aparencia.padrao(),
    )


class DefinirAparenciaRequisicao(BaseModel):
    # Tipos estritos: "10" ou 1.5 não viram matiz; a faixa 0-359 e o nome são regras do domínio.
    matiz: StrictInt
    intensidade: IntensidadeDaCor
    textura: TexturaDoFundo
    nome: StrictStr
    marca: MarcaDoApp


class OpcaoDeAparenciaResposta(BaseModel):
    codigo: str
    nome: str


class OpcoesDeAparenciaResposta(BaseModel):
    intensidades: list[OpcaoDeAparenciaResposta]
    texturas: list[OpcaoDeAparenciaResposta]
    marcas: list[OpcaoDeAparenciaResposta]


class PerfilResposta(UsuarioResposta):
    """O usuário atual (GET /auth/eu), com o que a SPA precisa para montar as telas."""

    # A pessoa é a dona da importação bancária e vê a aba Importadas.
    importacao_bancaria: bool = False
    gestao_de_investimentos: bool = False
    aparencia: AparenciaResposta


class SessaoResposta(BaseModel):
    """O token de sessão, também entregue no cookie ``gastoba_sessao`` (HttpOnly)."""

    token: str
    expira_em: datetime


class CriarChaveDeApiRequisicao(BaseModel):
    nome: str
    escopo: EscopoDaChave
    # Com fuso horário (ex.: "2026-12-31T23:59:59Z"); sem ele, 422 expiracao_invalida.
    expira_em: datetime | None = None


class ChaveDeApiResposta(BaseModel):
    """Chave de API na listagem: nunca traz o segredo, só o prefixo público."""

    id: UUID
    nome: str
    prefixo: str
    escopo: EscopoDaChave
    criada_em: datetime
    ultimo_uso: datetime | None
    expira_em: datetime | None


class ChaveDeApiCriadaResposta(ChaveDeApiResposta):
    """Resposta da criação: o único momento em que o segredo aparece."""

    segredo: str


class DetalheDoErro(BaseModel):
    campo: str
    mensagem: str


class CorpoDoErro(BaseModel):
    codigo: str
    mensagem: str
    detalhes: list[DetalheDoErro] | None = None


class RespostaDeErro(BaseModel):
    """Formato único de erro: ``{"erro": {"codigo", "mensagem", "detalhes"?}}``."""

    erro: CorpoDoErro


class DestinacaoDoInvestimentoResposta(BaseModel):
    cor: str | None
    # ``None`` na parte do saldo que ainda não tem destinação.
    tag: str | None
    principal: str
    valor_atual: str
    # `valor_atual - principal` e o ganho sobre o principal em % (nulo sem principal).
    rendimento: str
    rentabilidade: str | None


class TaxaDoInvestimentoResposta(BaseModel):
    # A remuneração como a instituição informa: ``percentual`` % do ``indexador`` (ou a taxa, se não
    # há indexador) e a parte fixa ao ano somada a ela. Zero não aparece (nulo).
    percentual: str | None
    indexador: str | None
    adicional_anual: str | None


class PendenciaDeInvestimentoResposta(BaseModel):
    # ``faltam_cotas`` ou ``sobram_cotas``; a quantidade é decimal em texto.
    tipo: str
    quantidade_estimada: str


class PendenciaDeOperacaoResposta(BaseModel):
    tipo: str
    data: date
    motivo: str


class InvestimentoResposta(BaseModel):
    pendencias_de_operacoes: list[PendenciaDeOperacaoResposta] = []
    alocacao_por_fracao: bool = False
    # Posição pelas operações. Sem histórico completo a rentabilidade é nula, com o motivo
    # ``historico_incompleto``; nunca um número inventado. O anualizado só existe com mais de 12
    # meses de histórico. Percentuais com duas casas, como texto decimal.
    # Nome normalizado com vencimento e taxa (e o final do id, só se ainda repetir): único.
    rotulo: str | None = None
    quantidade: str | None = None
    custo_medio: str | None = None
    historico_completo: bool = False
    rentabilidade_do_periodo: str | None = None
    rentabilidade_anualizada: str | None = None
    motivo_sem_rentabilidade: str | None = None
    pendencias: list[PendenciaDeInvestimentoResposta] = []
    # ``confirmar_quantidade``, ``completar``, ``conferir_operacoes`` ou nulo: diz à tela qual
    # botão acompanha o aviso do histórico.
    acao_do_historico: str | None = None
    data_de_aplicacao: date | None = None
    conta_id: UUID | None = None
    custos_registrados: str = "0.00"
    resultado_realizado: str | None = None
    id: UUID
    nome: str
    tipo: str
    subtipo: str | None
    saldo: str
    # Valor aplicado, lucro e a rentabilidade em % (lucro / aplicado). Vêm da instituição; sem isso,
    # são nulos, exceto na conta remunerada (``CAIXINHA``), estimada pelo principal registrado.
    # ``origem_da_rentabilidade``: "instituicao" ou nulo ("aportes" deixou de existir na 071).
    valor_aplicado: str | None
    rendimento: str | None
    rentabilidade: str | None
    origem_da_rentabilidade: str | None
    # Com o histórico das operações fechado: o aplicado (custo médio) e o lucro sobre ele; a tela
    # os prefere ao aplicado da instituição, que pode estar defasado.
    valor_aplicado_das_operacoes: str | None = None
    rendimento_das_operacoes: str | None = None
    # Nula quando a instituição não informa taxa.
    taxa: TaxaDoInvestimentoResposta | None
    # Vencimento do título, se a instituição informa.
    vencimento: date | None = None
    # Dia do último saldo guardado; nulo se o Gastoba ainda não guardou nenhum.
    atualizado_em: date | None
    destinacoes: list[DestinacaoDoInvestimentoResposta]


class FatiaDeInvestimentoResposta(BaseModel):
    cor: str | None
    # A tag (visão por destinação) ou o tipo (visão por tipo); nulo = sem destinação.
    rotulo: str | None
    valor: str


class AportesSemDestinoResposta(BaseModel):
    total: str
    quantidade: int


class ResumoDeInvestimentosResposta(BaseModel):
    aportes_sem_destino: AportesSemDestinoResposta
    visao: str
    total: str
    fatias: list[FatiaDeInvestimentoResposta]


class PontoDoHistoricoResposta(BaseModel):
    investimento_id: UUID
    data: date
    saldo: str


class RealocarRequisicao(BaseModel):
    origem: str
    destino: str
    data: date
    # Informe só um dos dois: o valor ou o percentual (inteiro de 1 a 100) do principal da origem.
    valor: StrictStr | None = None
    percentual: int | None = None


class RealocacaoResposta(BaseModel):
    id: UUID
    investimento_id: UUID
    origem: str
    destino: str
    valor: str
    data: date


class AssociarMovimentoRequisicao(BaseModel):
    investimento_id: UUID
    destinacoes: list[DestinacaoRequisicao]


class PartesDoMovimentoResposta(BaseModel):
    tag: str
    valor: str
    # Categoria do vínculo da caixinha na hora do aporte; nula sem vínculo (e no resgate).
    categoria: str | None = None
    # No resgate, quanto desta parte compras já usaram; nulo se nenhuma usou.
    coberto: str | None = None


class DefinirDestinacoesRequisicao(BaseModel):
    # Como repartir a parte da posição ainda sem principal (soma 100%, sem tag repetida).
    destinacoes: list[DestinacaoRequisicao]


class DesfazerClassificacaoRequisicao(BaseModel):
    desfazer_dependencias: bool = False
    versao_esperada: str | None = None
    desfazer_divisao_inteira: bool = False


class ReclassificarTransacaoRequisicao(BaseModel):
    # ``gasto``, ``ganho``, ``transferencia_para_investimento``, ``imposto``, ``custo`` ou
    # ``rendimento_da_posicao`` (a entrada de rendimento de um título, que não é renda).
    rotulo: StrictStr
    # A versão da prévia (``/impacto-da-reversao``): sem ela, ou se mudou, nada é alterado.
    versao_esperada: StrictStr
    categoria: CategoriaDoGasto | None = None
    tags: list[str] = []
    investimento_id: UUID | None = None
    movimento_relacionado_id: UUID | None = None
    destinacoes: list[DestinacaoRequisicao] = []
    desfazer_divisao_inteira: bool = False
    desfazer_dependencias: bool = False


class ClassificacaoDesfeitaResposta(BaseModel):
    transacao_id: UUID
    estado: str
    lancamentos_removidos: int


class NaturezaDoResgateRequisicao(BaseModel):
    tipo: Literal["resgate", "vencimento"]


class MovimentoDeInvestimentoResposta(BaseModel):
    # Do texto do banco: ``liquidacao_de_bolsa``, ``imposto_ou_taxa``, ``conta_remunerada``,
    # ``vencimento``, ``rendimento`` ou ``outra``.
    natureza: str = "outra"
    # Casamento (frente 061) que originou o movimento; por ora sempre nulo.
    casamento_id: UUID | None = None
    vencimento_confirmado: bool = False
    investimento_nome: str | None = None
    revisao_contabil_pendente: bool = False
    movimento_relacionado_id: UUID | None = None
    categoria: str | None
    revisao_pendente: bool
    id: UUID
    transacao_importada_id: UUID | None
    # Nulo só no saldo inicial (``origem`` ``saldo_inicial``), que não sai de conta.
    conta_id: UUID | None
    investimento_id: UUID | None
    tipo: str
    # ``open_finance``, ``manual`` (gasto antigo convertido) ou ``saldo_inicial``.
    origem: str
    descricao: str
    valor: str
    data: date
    destinacoes: list[PartesDoMovimentoResposta]


class ParteDaDivisaoRequisicao(BaseModel):
    como_investimento: bool = False
    # Obrigatória no gasto; opcional no aporte; proibida na entrada.
    categoria: CategoriaDoGasto | None = None
    tags: list[str] = []
    percentual: int
    # Só na parte de aporte: o investimento e como repartir a fatia (soma 100%).
    investimento_id: UUID | None = None
    destinacoes: list[DestinacaoRequisicao] = []


class DividirTransacaoRequisicao(BaseModel):
    # De 2 a 10 partes, de 1 a 100% cada, somando 100%.
    partes: list[ParteDaDivisaoRequisicao]


class DivisaoResposta(BaseModel):
    # Um gasto, ganho ou aporte por parte, na ordem enviada (parte sem centavo é descartada).
    criados: list[AceiteResposta]


class AlvoDaMetaResposta(BaseModel):
    codigo: str
    nome: str


class AssociarCompraRequisicao(BaseModel):
    tag: str
    valor: StrictStr
    movimento_id: UUID | None = None


class ReservaDaDestinacaoResposta(BaseModel):
    tag: str
    reservado: str
    coberto: str
    disponivel: str
    cor: str | None


class PendenciasDeRevisaoResposta(BaseModel):
    aportes: list[MovimentoDeInvestimentoResposta]
    gastos: list[GastoResposta]
    recorrencias: list[RecorrenciaResposta]


class RevisarAporteRequisicao(BaseModel):
    categoria: CategoriaDoGasto | None
    investimento_id: UUID | None = None
    destinacoes: list[DestinacaoRequisicao] = []


class RevisarCategoriaRequisicao(BaseModel):
    categoria: CategoriaDoGasto


class DefinirCorRequisicao(BaseModel):
    tag: str
    cor: CorDaDestinacao


class CorDaDestinacaoResposta(BaseModel):
    tag: str
    cor: str


class FaturaResposta(BaseModel):
    id: UUID
    inicio: date | None
    fechamento: date
    vencimento: date | None
    total: str
    pago: str
    restante: str
    a_favor: str
    minimo: str | None
    situacao: str
    fonte: str
    quantidade_de_compras: int


class CartaoComFaturasResposta(BaseModel):
    conta_id: UUID
    conta_nome: str
    valor_devido: str
    faturas: list[FaturaResposta]


class ListaDeFaturasResposta(BaseModel):
    cartoes: list[CartaoComFaturasResposta]


class CompraDaFaturaResposta(BaseModel):
    id: UUID
    data: date
    descricao: str
    valor: str
    sentido: str
    parcela_numero: int | None
    parcela_total: int | None
    estado: str


class PagamentoDaFaturaResposta(BaseModel):
    data: date
    valor: str
    forma: str | None


class FaturaDetalhadaResposta(FaturaResposta):
    compras: list[CompraDaFaturaResposta]
    pagamentos: list[PagamentoDaFaturaResposta]


class ImpactoDaReversaoResposta(BaseModel):
    transacoes_reabertas: int
    coberturas_removidas: int
    transacao_id: UUID
    versao: str
    lancamentos_removidos: int
    divisao_inteira: bool


class DefinirPapelDaContaRequisicao(BaseModel):
    papel: PapelDaConta


class DefinirApelidoDaContaRequisicao(BaseModel):
    apelido: StrictStr


class ClassificarTransferenciaRequisicao(BaseModel):
    conta_contraparte_id: UUID
    par_transacao_id: UUID | None = None


class CompletarParRequisicao(BaseModel):
    transacao_id: UUID


class TransferenciaResposta(BaseModel):
    id: UUID
    conta_origem_id: UUID
    conta_destino_id: UUID
    valor: str
    data: date
    aporte_liquido: str
    papel_origem: str
    papel_destino: str
    transacao_origem_id: UUID | None
    transacao_destino_id: UUID | None
    competencia_provisoria: bool


class DefinirCaixinhaRequisicao(BaseModel):
    conta_id: UUID
    saldo_remunerado: StrictStr
    data_do_saldo: date


class CaixinhaResposta(BaseModel):
    id: UUID
    nome: str
    saldo: str


class ReferenciaDaCaixinhaRequisicao(BaseModel):
    saldo_inicial: StrictStr
    saldo_final: StrictStr
    periodo_completo: bool


class ReferenciaDaCaixinhaResposta(BaseModel):
    investimento_id: UUID
    mes: str
    saldo_inicial: str
    saldo_final: str
    periodo_completo: bool


class ReconciliacaoDaCaixinhaResposta(BaseModel):
    saldo_inicial: str
    saldo_observado: str
    saldo_calculado: str
    diferenca: str
    completo: bool
    conciliado: bool


class ConfirmarReaplicacaoRequisicao(BaseModel):
    aporte_id: UUID
    resgate_id: UUID
    valor: StrictStr


class ReaplicacaoDeResgateResposta(BaseModel):
    id: UUID
    aporte_id: UUID
    resgate_id: UUID
    valor: str


class ResgateParaReaplicarResposta(BaseModel):
    id: UUID
    data: date
    descricao: str
    investimento_nome: str
    valor: str
    disponivel: str


class VinculoDeCasamentoResposta(BaseModel):
    transacao_id: UUID
    # ``bruto`` (débito ou crédito da liquidação), ``taxa`` ou ``imposto``.
    papel: str


class CasamentoResposta(BaseModel):
    id: UUID
    # Um casamento liga uma ou mais operações (o débito do pregão paga várias compras).
    operacao_ids: list[UUID]
    vinculos: list[VinculoDeCasamentoResposta]


class OperacaoResposta(BaseModel):
    id: UUID
    investimento_id: UUID
    # ``COMPRA``, ``VENDA``, ``PROVENTO``, ``TAXA``, ``IMPOSTO``, ``VENCIMENTO`` ou ``ABERTURA``.
    tipo: str
    data: date
    # Decimal em texto (renda fixa usa "1").
    quantidade: str
    valor: str
    custos: str
    # ``pluggy`` (imutável), ``manual`` ou ``abertura`` (editáveis e excluíveis).
    origem: str
    editavel: bool
    # A da corretora que veio sem quantidade: só a quantidade pode ser confirmada.
    quantidade_confirmavel: bool = False
    # Quantidade derivada na migração: "estimada, confirme". Nunca fecha o histórico.
    quantidade_estimada: bool
    operacao_relacionada_id: UUID | None


class LancarOperacaoRequisicao(BaseModel):
    tipo: StrictStr
    data: date
    quantidade: StrictStr
    valor: StrictStr
    custos: StrictStr | None = None
    operacao_relacionada_id: UUID | None = None
    # Quando já há uma operação igual da corretora: confirma que é outra operação.
    confirmar_duplicidade: bool = False


class AlterarOperacaoRequisicao(BaseModel):
    data: date | None = None
    quantidade: StrictStr | None = None
    valor: StrictStr | None = None
    custos: StrictStr | None = None


class AporteSemInvestimentoResposta(BaseModel):
    id: UUID
    conta_id: UUID | None
    data: date
    valor: str
    # O texto do banco e a natureza dele (`liquidacao_de_bolsa`, `imposto_ou_taxa`,
    # `conta_remunerada`, `vencimento`, `rendimento` ou `outra`): só `outra` pode ser mesclada ou
    # excluída; o resto se liga a uma operação ou à conta investimentos.
    descricao: str
    natureza: str
    # Outro aporte da mesma conta, dia e valor: só uma sugestão de duplicado.
    duplicado_sugerido_id: UUID | None
    # Já registrado (mescla ou exclusão lógica), aguardando a aprovação do dono.
    tratamento_pendente_de_aprovacao: bool


class MesclarAporteRequisicao(BaseModel):
    mantido_id: UUID


class TratamentoDeAporteResposta(BaseModel):
    id: UUID
    movimento_id: UUID
    acao: str
    # Só vale nos totais depois da aprovação por escrito do dono (comando ``--aprovar``).
    aprovado: bool


class SugestaoDeReaplicacaoResposta(BaseModel):
    operacao_id: UUID
    aporte_id: UUID
    valor: str


class OperacaoNaPropostaResposta(BaseModel):
    id: UUID
    posicao_id: UUID
    rotulo: str
    tipo: str
    data: date
    quantidade: str
    valor_bruto: str
    custos: str


class TransacaoNaPropostaResposta(BaseModel):
    id: UUID
    data: date
    descricao: str
    valor: str
    # pendente, aporte_sem_investimento, resgate_sem_investimento, ganho ou aporte_de_outra_posicao.
    situacao: str


class EfeitoDaPropostaResposta(BaseModel):
    transacao_id: UUID
    # aporte_passa_a_ser_da_posicao, taxa_deixa_de_ser_aporte, ganho_deixa_de_ser_renda ou
    # aceita_a_pendente.
    codigo: str


class PropostaDeCasamentoResposta(BaseModel):
    chave: str
    versao: str
    # compra_na_bolsa, venda_na_bolsa ou resgate_de_renda_fixa.
    tipo: str
    data_do_pregao: date
    operacoes: list[OperacaoNaPropostaResposta]
    bruto: list[TransacaoNaPropostaResposta]
    taxas: list[TransacaoNaPropostaResposta]
    # Dinheiro com sinal: bruto da conta menos o das operações; o mesmo para o custo.
    diferenca: str
    diferenca_de_custo: str
    # ``exata`` ou ``precisa_escolher`` (a pessoa escolhe entre as ``operacoes`` candidatas).
    confianca: str
    motivo: str | None
    efeitos: list[EfeitoDaPropostaResposta]


class ItemSemParResposta(BaseModel):
    motivo: str
    operacao_id: UUID | None
    transacao_id: UUID | None
    # O que é o item: "Compra de AUVP11 (3)" ou a descrição do banco, com data e valor.
    descricao: str
    data: date | None
    valor: str | None
    # Aditivo (069): ``entrada`` ou ``saida``, pelo tipo da operação ou da transação.
    sentido: str | None
    # Aditivo (069): gasto antigo de liquidação, a trocar pela ligação (``trocar-gasto``).
    pode_trocar_pela_ligacao: bool = False


class ItemConciliadoResposta(BaseModel):
    """Operação da corretora já tratada na caixa, na mesma posição: só informação."""

    operacao_id: UUID
    transacao_id: UUID
    descricao: str
    data: date
    valor: str
    # Aditivo (069): ``entrada`` ou ``saida``.
    sentido: str


class CasamentoConfirmadoResposta(BaseModel):
    id: UUID
    operacao_ids: list[UUID]
    vinculos: list[VinculoDeCasamentoResposta]
    # Ligação antiga: nenhum aporte ou resgate foi registrado por ela (use "Refazer ligação").
    sem_aporte: bool


class RevisaoDaBolsaResposta(BaseModel):
    propostas: list[PropostaDeCasamentoResposta]
    sem_par: list[ItemSemParResposta]
    confirmados: list[CasamentoConfirmadoResposta]
    # Aditivo (069): operações já conciliadas pela caixa, que não pedem ligação.
    conciliadas: list[ItemConciliadoResposta] = []


class ItemDeConfirmacaoRequisicao(BaseModel):
    chave: str
    versao: str
    # Só lido quando a proposta ``precisa_escolher``.
    operacao_ids: list[UUID] = []


class ConfirmarPropostasRequisicao(BaseModel):
    itens: Annotated[list[ItemDeConfirmacaoRequisicao], Field(min_length=1, max_length=50)]


class LigacaoConfirmadaResposta(BaseModel):
    casamento_id: UUID
    chave: str


class ConfirmarPropostasResposta(BaseModel):
    confirmados: list[LigacaoConfirmadaResposta]
