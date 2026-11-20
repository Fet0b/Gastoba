import json
import logging
import time
from collections import Counter
from datetime import UTC, date, datetime
from decimal import ROUND_HALF_EVEN, Decimal, InvalidOperation
from typing import Any
from urllib.parse import parse_qs, quote
from zoneinfo import ZoneInfo

import httpx

from gastoba.domain.conta import TipoDaConta, final_do_numero_de
from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.excecoes import ProvedorIndisponivel, ValorInvalido
from gastoba.domain.mes import FUSO_DO_NEGOCIO
from gastoba.domain.portas import (
    ContaExterna,
    InvestimentoExterno,
    OperacaoExterna,
    TransacaoExterna,
)
from gastoba.domain.transacao_importada import SentidoDaTransacao

_registro = logging.getLogger(__name__)

URL_BASE_DA_PLUGGY = "https://api.pluggy.ai"
LIMITE_DE_PAGINAS = 200
# A chave de API da Pluggy vale 2 horas; renova-se antes, e também ao receber 401.
VALIDADE_DA_CHAVE_EM_SEGUNDOS = 100 * 60
TEMPO_LIMITE_EM_SEGUNDOS = 20.0

MENSAGEM_DE_FALHA = "A Pluggy não respondeu como esperado."

# Etapa de cada rota, para o motivo da falha (só estas palavras vão ao log).
ETAPAS = {
    "/auth": "autenticacao",
    "/accounts": "contas",
    "/bills": "faturas",
    "/investments": "investimentos",
    "/v2/transactions": "transacoes",
}


def _falha(caminho: str, detalhe: str) -> ProvedorIndisponivel:
    etapa = ETAPAS.get(caminho, "pluggy")
    return ProvedorIndisponivel(MENSAGEM_DE_FALHA, motivo=f"{etapa} {detalhe}")


class ProvedorPluggy:
    """Satisfaz a porta ProvedorOpenFinance falando com a API da Pluggy (conector MeuPluggy).

    Segredos e dados bancários nunca vão para log nem para a mensagem dos erros: toda falha vira
    ``ProvedorIndisponivel`` com texto fixo. Números são lidos como ``Decimal``, nunca ``float``.
    """

    def __init__(
        self,
        id_do_cliente: str,
        segredo_do_cliente: str,
        cliente: httpx.Client | None = None,
        url_base: str = URL_BASE_DA_PLUGGY,
    ) -> None:
        self._id_do_cliente = id_do_cliente
        self._segredo_do_cliente = segredo_do_cliente
        self._cliente = cliente or httpx.Client(timeout=TEMPO_LIMITE_EM_SEGUNDOS)
        self._url_base = url_base.rstrip("/")
        self._chave: str | None = None
        self._chave_vale_ate = 0.0

    # --- porta ---

    def listar_contas(self, id_do_item: str) -> list[ContaExterna]:
        corpo = self._obter("/accounts", {"itemId": id_do_item})
        contas = []
        descartes: Counter[str] = Counter()
        for dado in _lista(corpo, "results", "/accounts"):
            conta = _conta_de(dado, descartes)
            if conta is not None:
                contas.append(conta)
        _avisar_descartes("contas", descartes)
        return contas

    def listar_investimentos(self, id_do_item: str) -> list[InvestimentoExterno]:
        corpo = self._obter("/investments", {"itemId": id_do_item})
        investimentos = []
        descartes: Counter[str] = Counter()
        for dado in _lista(corpo, "results", "/investments"):
            investimento = _investimento_de(dado, descartes)
            if investimento is not None:
                investimentos.append(investimento)
        _avisar_descartes("investimentos", descartes)
        return investimentos

    def listar_transacoes(self, id_da_conta: str, desde: date) -> list[TransacaoExterna]:
        transacoes: list[TransacaoExterna] = []
        # A rota por página (/transactions) foi descontinuada: a v2 pagina por cursor.
        cursor: str | None = None
        for _ in range(LIMITE_DE_PAGINAS):
            parametros = {"accountId": id_da_conta, "dateFrom": desde.isoformat()}
            if cursor is not None:
                parametros["after"] = cursor
            corpo = self._obter("/v2/transactions", parametros)
            for dado in _lista(corpo, "results", "/v2/transactions"):
                transacao = _transacao_de(dado)
                if transacao is not None:
                    transacoes.append(transacao)
            cursor = _cursor_de(corpo.get("next"))
            if cursor is None:
                break
        return transacoes

    def listar_operacoes_do_investimento(self, id_do_investimento: str) -> list[OperacaoExterna]:
        """Operações de uma posição (``/investments/{id}/transactions``), paginado por ``page``.

        A Pluggy não filtra por data nesta rota; traz tudo. Operação malformada é descartada e
        contada num aviso, sem ids nem valores.
        """
        operacoes: list[OperacaoExterna] = []
        descartes: Counter[str] = Counter()
        for pagina in range(1, LIMITE_DE_PAGINAS + 1):
            corpo = self._obter(
                f"/investments/{quote(id_do_investimento, safe='')}/transactions",
                {"page": pagina, "pageSize": 500},
            )
            resultados = _lista(corpo, "results", "/investments/transactions")
            if not resultados:
                break
            for dado in resultados:
                operacao = _operacao_de(dado, descartes)
                if operacao is not None:
                    operacoes.append(operacao)
            total = corpo.get("totalPages")
            if isinstance(total, int) and pagina >= total:
                break
        _avisar_descartes("operações de investimento", descartes)
        return operacoes

    def obter_bruto(self, caminho: str, parametros: dict[str, Any]) -> dict[str, Any]:
        """Diagnóstico: o JSON cru de um GET, sem converter nada (só leitura)."""
        return self._obter(caminho, parametros)

    # --- HTTP ---

    def _obter(self, caminho: str, parametros: dict[str, Any]) -> dict[str, Any]:
        resposta = self._pedir("GET", caminho, parametros=parametros)
        if resposta.status_code == httpx.codes.UNAUTHORIZED:
            # A chave pode ter sido revogada ou ter expirado antes do prazo: uma tentativa nova.
            self._chave = None
            resposta = self._pedir("GET", caminho, parametros=parametros)
        return _corpo_de(resposta, caminho)

    def _pedir(
        self,
        metodo: str,
        caminho: str,
        parametros: dict[str, Any] | None = None,
        corpo: dict[str, Any] | None = None,
    ) -> httpx.Response:
        cabecalhos = {} if caminho == "/auth" else {"X-API-KEY": self._obter_chave()}
        try:
            return self._cliente.request(
                metodo,
                self._url_base + caminho,
                params=parametros,
                json=corpo,
                headers=cabecalhos,
            )
        except httpx.HTTPError as erro:
            # Sem `from erro`: o texto do erro pode trazer a URL e os parâmetros.
            raise _falha(caminho, f"rede {type(erro).__name__}") from None

    def _obter_chave(self) -> str:
        if self._chave is not None and time.monotonic() < self._chave_vale_ate:
            return self._chave
        resposta = self._pedir(
            "POST",
            "/auth",
            corpo={"clientId": self._id_do_cliente, "clientSecret": self._segredo_do_cliente},
        )
        corpo = _corpo_de(resposta, "/auth")
        chave = corpo.get("apiKey")
        if not isinstance(chave, str) or not chave:
            raise _falha("/auth", "resposta invalida")
        self._chave = chave
        self._chave_vale_ate = time.monotonic() + VALIDADE_DA_CHAVE_EM_SEGUNDOS
        return chave


def _corpo_de(resposta: httpx.Response, caminho: str) -> dict[str, Any]:
    if resposta.status_code != httpx.codes.OK:
        raise _falha(caminho, f"http {resposta.status_code}")
    try:
        corpo = resposta.json(parse_float=Decimal)
    except ValueError:
        raise _falha(caminho, "resposta invalida") from None
    if not isinstance(corpo, dict):
        raise _falha(caminho, "resposta invalida")
    return corpo


def _lista(corpo: dict[str, Any], campo: str, caminho: str) -> list[dict[str, Any]]:
    itens = corpo.get(campo)
    if not isinstance(itens, list):
        raise _falha(caminho, "resposta invalida")
    return [item for item in itens if isinstance(item, dict)]


def _cursor_de(proxima: object) -> str | None:
    """O valor de `after` dentro do `next` (uma query string pronta); None quando acabou."""
    if not isinstance(proxima, str):
        return None
    valores = parse_qs(proxima.lstrip("?")).get("after")
    return valores[0] if valores else None


def _decimal(valor: object) -> Decimal | None:
    if isinstance(valor, bool) or not isinstance(valor, int | Decimal):
        return None
    return Decimal(valor)


def _avisar_descartes(o_que: str, descartes: Counter[str]) -> None:
    """Descartar nunca é silencioso: só as contagens por motivo vão ao log (Art. IV.3)."""
    if descartes:
        motivos = " ".join(f"{motivo}={total}" for motivo, total in sorted(descartes.items()))
        _registro.warning("Pluggy: %s descartados (%s).", o_que, motivos)


def _conta_de(dado: dict[str, Any], descartes: Counter[str]) -> ContaExterna | None:
    """Conta bancária ou cartão em reais; o que não serve é contado em ``descartes``."""
    id_externo = dado.get("id")
    nome = dado.get("name")
    saldo = _decimal(dado.get("balance"))
    if not isinstance(id_externo, str) or not isinstance(nome, str) or saldo is None:
        descartes["sem_saldo"] += 1
        return None
    if dado.get("currencyCode") != "BRL":
        descartes["moeda"] += 1
        return None
    tipo = dado.get("type")
    if tipo == "CREDIT":
        # Para o cartão a Pluggy informa o valor devido: no Gastoba a dívida é saldo negativo.
        saldo = -saldo
        tipo_da_conta = TipoDaConta.CARTAO
    elif tipo == "BANK":
        tipo_da_conta = TipoDaConta.CORRENTE
    else:
        descartes["tipo"] += 1
        return None
    try:
        return ContaExterna(
            id_externo=id_externo,
            nome=nome.strip() or "Conta",
            saldo=_dinheiro(saldo),
            tipo=tipo_da_conta,
            # Só os quatro últimos dígitos saem daqui; um número ruim apenas fica sem final.
            final_do_numero=final_do_numero_de(dado.get("number")),
        )
    except ValorInvalido:
        descartes["valor"] += 1
        return None


def _investimento_de(dado: dict[str, Any], descartes: Counter[str]) -> InvestimentoExterno | None:
    """Posição de investimento em reais; guarda o registro inteiro, nada é jogado fora."""
    id_externo = dado.get("id")
    nome = dado.get("name")
    tipo = dado.get("type")
    if not isinstance(id_externo, str) or not isinstance(nome, str) or not isinstance(tipo, str):
        descartes["tipo"] += 1
        return None
    saldo = _decimal(dado.get("balance"))
    if saldo is None:
        descartes["sem_saldo"] += 1
        return None
    if dado.get("currencyCode", "BRL") != "BRL":
        descartes["moeda"] += 1
        return None
    subtipo = dado.get("subtype")
    try:
        return InvestimentoExterno(
            id_externo=id_externo,
            nome=nome.strip() or "Investimento",
            tipo=tipo,
            subtipo=subtipo if isinstance(subtipo, str) else None,
            saldo=_dinheiro(saldo),
            valor_aplicado=_dinheiro_opcional(dado.get("amountOriginal")),
            rendimento=_dinheiro_opcional(dado.get("amountProfit")),
            # Decimal vira texto, para o valor voltar exato.
            dados=json.dumps(dado, default=str, sort_keys=True),
        )
    except ValorInvalido:
        descartes["valor"] += 1
        return None


def _data_de(valor: object) -> date | None:
    if isinstance(valor, str) and len(valor) >= 10:
        try:
            return date.fromisoformat(valor[:10])
        except ValueError:
            return None
    return None


def _operacao_de(dado: dict[str, Any], descartes: Counter[str]) -> OperacaoExterna | None:
    id_externo = dado.get("id")
    tipo = dado.get("type")
    data = _data_de(dado.get("date"))
    bruto = _decimal(dado.get("amount"))
    if not isinstance(id_externo, str) or not isinstance(tipo, str) or data is None:
        descartes["tipo"] += 1
        return None
    if bruto is None:
        descartes["sem_valor"] += 1
        return None
    despesas = dado.get("expenses")
    custos = None
    try:
        if isinstance(despesas, dict):
            # `custodyFee` repete o líquido da liquidação do dia (medido em produção, 2026-11-11:
            # -142,08 em duas compras de ativos diferentes), não é custo da operação.
            soma = sum(
                (
                    abs(d)
                    for nome, valor in despesas.items()
                    if nome != "custodyFee"
                    for d in [_decimal(valor)]
                    if d is not None
                ),
                Decimal(0),
            )
            custos = _dinheiro(soma) if soma != 0 else None
        quantidade = _decimal(dado.get("quantity"))
        return OperacaoExterna(
            id_externo=id_externo,
            tipo=tipo,
            data=data,
            quantidade=str(quantidade) if quantidade is not None else None,
            valor_bruto=_dinheiro(abs(bruto)),
            custos=custos,
            sentido=dado.get("movementType") if isinstance(dado.get("movementType"), str) else None,
            data_do_pregao=_data_de(dado.get("tradeDate")),
        )
    except ValorInvalido:
        descartes["valor"] += 1
        return None


def _dinheiro(valor: Decimal) -> Dinheiro:
    return Dinheiro.de_reais(valor)


def _dinheiro_opcional(valor: object) -> Dinheiro | None:
    """Campo informativo (aplicado, lucro): arredonda ao centavo; ausente ou ruim vira nulo.

    Um campo desses estar errado nunca derruba a posição inteira.
    """
    numero = _decimal(valor)
    if numero is None:
        return None
    try:
        return Dinheiro.de_reais(numero.quantize(Decimal("0.01"), rounding=ROUND_HALF_EVEN))
    except ValorInvalido, ArithmeticError:
        return None


def _transacao_de(dado: dict[str, Any]) -> TransacaoExterna | None:
    """Transação já postada, em reais e com valor representável; as demais são ignoradas."""
    if dado.get("status") != "POSTED" or dado.get("currencyCode", "BRL") != "BRL":
        return None
    valor = _decimal(dado.get("amount"))
    identificador = dado.get("providerId") or dado.get("id")
    data = _data_de(dado.get("date"))
    if valor is None or valor == 0 or not isinstance(identificador, str) or data is None:
        return None
    tipo = dado.get("type")
    if tipo == "DEBIT":
        sentido = SentidoDaTransacao.SAIDA
    elif tipo == "CREDIT":
        sentido = SentidoDaTransacao.ENTRADA
    else:
        # Conta e cartão têm sinais opostos: sem o tipo o sentido seria um palpite.
        return None
    try:
        dinheiro = Dinheiro.de_reais(abs(valor))
    except ValorInvalido, InvalidOperation:
        return None
    descricao = dado.get("description")
    operacao = dado.get("operationType")
    return TransacaoExterna(
        id_externo=identificador,
        valor=dinheiro,
        descricao=descricao if isinstance(descricao, str) else "",
        data=data,
        sentido=sentido,
        tipo_de_operacao=operacao if isinstance(operacao, str) else None,
    )


def _data_de(texto: object) -> date | None:
    """Data da transação: meia-noite UTC é o próprio dia; outros horários vão para Brasília."""
    if not isinstance(texto, str):
        return None
    try:
        instante = datetime.fromisoformat(texto.replace("Z", "+00:00"))
    except ValueError:
        return None
    if instante.tzinfo is None:
        return instante.date()
    instante = instante.astimezone(UTC)
    if (instante.hour, instante.minute, instante.second, instante.microsecond) == (0, 0, 0, 0):
        return instante.date()
    return instante.astimezone(ZoneInfo(FUSO_DO_NEGOCIO)).date()
