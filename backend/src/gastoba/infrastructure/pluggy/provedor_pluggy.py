import time
from datetime import UTC, date, datetime
from decimal import Decimal, InvalidOperation
from typing import Any
from zoneinfo import ZoneInfo

import httpx

from gastoba.domain.conta import TipoDaConta
from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.excecoes import ProvedorIndisponivel, ValorInvalido
from gastoba.domain.mes import FUSO_DO_NEGOCIO
from gastoba.domain.portas import ContaExterna, TransacaoExterna
from gastoba.domain.transacao_importada import SentidoDaTransacao

URL_BASE_DA_PLUGGY = "https://api.pluggy.ai"
TAMANHO_DA_PAGINA = 500
LIMITE_DE_PAGINAS = 200
# A chave de API da Pluggy vale 2 horas; renova-se antes, e também ao receber 401.
VALIDADE_DA_CHAVE_EM_SEGUNDOS = 100 * 60
TEMPO_LIMITE_EM_SEGUNDOS = 20.0

MENSAGEM_DE_FALHA = "A Pluggy não respondeu como esperado."


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
        for dado in _lista(corpo, "results"):
            conta = _conta_de(dado)
            if conta is not None:
                contas.append(conta)
        return contas

    def listar_transacoes(self, id_da_conta: str, desde: date) -> list[TransacaoExterna]:
        transacoes: list[TransacaoExterna] = []
        pagina = 1
        while pagina <= LIMITE_DE_PAGINAS:
            corpo = self._obter(
                "/transactions",
                {
                    "accountId": id_da_conta,
                    "from": desde.isoformat(),
                    "pageSize": TAMANHO_DA_PAGINA,
                    "page": pagina,
                },
            )
            for dado in _lista(corpo, "results"):
                transacao = _transacao_de(dado)
                if transacao is not None:
                    transacoes.append(transacao)
            total_de_paginas = corpo.get("totalPages", 1)
            if not isinstance(total_de_paginas, int) or pagina >= total_de_paginas:
                break
            pagina += 1
        return transacoes

    # --- HTTP ---

    def _obter(self, caminho: str, parametros: dict[str, Any]) -> dict[str, Any]:
        resposta = self._pedir("GET", caminho, parametros=parametros)
        if resposta.status_code == httpx.codes.UNAUTHORIZED:
            # A chave pode ter sido revogada ou ter expirado antes do prazo: uma tentativa nova.
            self._chave = None
            resposta = self._pedir("GET", caminho, parametros=parametros)
        return _corpo_de(resposta)

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
        except httpx.HTTPError:
            # Sem `from erro`: o texto do erro pode trazer a URL e os parâmetros.
            raise ProvedorIndisponivel(MENSAGEM_DE_FALHA) from None

    def _obter_chave(self) -> str:
        if self._chave is not None and time.monotonic() < self._chave_vale_ate:
            return self._chave
        resposta = self._pedir(
            "POST",
            "/auth",
            corpo={"clientId": self._id_do_cliente, "clientSecret": self._segredo_do_cliente},
        )
        corpo = _corpo_de(resposta)
        chave = corpo.get("apiKey")
        if not isinstance(chave, str) or not chave:
            raise ProvedorIndisponivel(MENSAGEM_DE_FALHA)
        self._chave = chave
        self._chave_vale_ate = time.monotonic() + VALIDADE_DA_CHAVE_EM_SEGUNDOS
        return chave


def _corpo_de(resposta: httpx.Response) -> dict[str, Any]:
    if resposta.status_code != httpx.codes.OK:
        raise ProvedorIndisponivel(MENSAGEM_DE_FALHA)
    try:
        corpo = resposta.json(parse_float=Decimal)
    except ValueError:
        raise ProvedorIndisponivel(MENSAGEM_DE_FALHA) from None
    if not isinstance(corpo, dict):
        raise ProvedorIndisponivel(MENSAGEM_DE_FALHA)
    return corpo


def _lista(corpo: dict[str, Any], campo: str) -> list[dict[str, Any]]:
    itens = corpo.get(campo)
    if not isinstance(itens, list):
        raise ProvedorIndisponivel(MENSAGEM_DE_FALHA)
    return [item for item in itens if isinstance(item, dict)]


def _decimal(valor: object) -> Decimal | None:
    if isinstance(valor, bool) or not isinstance(valor, int | Decimal):
        return None
    return Decimal(valor)


def _conta_de(dado: dict[str, Any]) -> ContaExterna | None:
    """Conta bancária ou cartão em reais; outras moedas e formatos desconhecidos são ignorados."""
    id_externo = dado.get("id")
    nome = dado.get("name")
    saldo = _decimal(dado.get("balance"))
    if not isinstance(id_externo, str) or not isinstance(nome, str) or saldo is None:
        return None
    if dado.get("currencyCode") != "BRL":
        return None
    tipo = dado.get("type")
    if tipo == "CREDIT":
        # Para o cartão a Pluggy informa o valor devido: no Gastoba a dívida é saldo negativo.
        saldo = -saldo
        tipo_da_conta = TipoDaConta.CARTAO
    elif tipo == "BANK":
        tipo_da_conta = TipoDaConta.CORRENTE
    else:
        return None
    try:
        return ContaExterna(
            id_externo=id_externo,
            nome=nome.strip() or "Conta",
            saldo=_dinheiro(saldo),
            tipo=tipo_da_conta,
        )
    except ValorInvalido:
        return None


def _dinheiro(valor: Decimal) -> Dinheiro:
    return Dinheiro.de_reais(valor)


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
