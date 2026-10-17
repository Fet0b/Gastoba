"""Limite de tentativas de entrar, em memória do processo.

Vale para uma réplica só (o cenário aprovado: servidor caseiro, poucos usuários). Com mais
de uma réplica, cada uma contaria à parte e o limite viraria uma tabela no banco.
"""

import math
import threading
from collections import deque
from collections.abc import Sequence
from datetime import datetime, timedelta

from gastoba.domain.excecoes import MuitasTentativas
from gastoba.domain.portas import Relogio

MAXIMO_DE_CHAVES_PADRAO = 10_000


class LimitadorDeTentativasEmMemoria:
    """Satisfaz a porta LimitadorDeTentativas: ``limite`` tentativas por chave na ``janela``.

    Janela deslizante: guarda o instante de cada tentativa (no máximo ``limite`` por chave)
    e esquece os mais antigos que a janela. Uma trava torna cada operação atômica, já que o
    FastAPI roda as rotas síncronas em várias threads. A memória tem teto: chaves sem
    tentativa na janela são varridas, e acima de ``maximo_de_chaves`` as mais antigas saem.
    """

    def __init__(
        self,
        limite: int,
        janela: timedelta,
        relogio: Relogio,
        maximo_de_chaves: int = MAXIMO_DE_CHAVES_PADRAO,
    ) -> None:
        if limite < 1 or janela <= timedelta(0) or maximo_de_chaves < 1:
            raise ValueError("Parâmetros do limitador de tentativas inválidos.")
        self._limite = limite
        self._janela = janela
        self._relogio = relogio
        self._maximo_de_chaves = maximo_de_chaves
        self._tentativas: dict[str, deque[datetime]] = {}
        self._ultima_varredura: datetime | None = None
        self._trava = threading.Lock()

    @property
    def quantidade_de_chaves(self) -> int:
        with self._trava:
            return len(self._tentativas)

    def registrar_tentativa(self, chaves: Sequence[str]) -> None:
        with self._trava:
            agora = self._relogio.agora()
            self._varrer_se_preciso(agora)
            espera = max((self._espera(chave, agora) for chave in chaves), default=0.0)
            if espera > 0:
                raise MuitasTentativas(math.ceil(espera))
            for chave in chaves:
                instantes = self._tentativas.pop(chave, None) or deque(maxlen=self._limite)
                instantes.append(agora)
                # Reinserida no fim: o dicionário fica em ordem de uso, a mais antiga primeiro.
                self._tentativas[chave] = instantes
            while len(self._tentativas) > self._maximo_de_chaves:
                del self._tentativas[next(iter(self._tentativas))]

    def zerar(self, chave: str) -> None:
        with self._trava:
            self._tentativas.pop(chave, None)

    def descontar(self, chave: str) -> None:
        with self._trava:
            instantes = self._tentativas.get(chave)
            if instantes:
                instantes.pop()
            if not instantes:
                self._tentativas.pop(chave, None)

    def _espera(self, chave: str, agora: datetime) -> float:
        """Segundos até a chave aceitar outra tentativa; 0 se já aceita."""
        instantes = self._tentativas.get(chave)
        if instantes is None:
            return 0.0
        while instantes and instantes[0] <= agora - self._janela:
            instantes.popleft()
        if len(instantes) < self._limite:
            return 0.0
        return (instantes[0] + self._janela - agora).total_seconds()

    def _varrer_se_preciso(self, agora: datetime) -> None:
        if self._ultima_varredura is not None and agora - self._ultima_varredura < self._janela:
            return
        self._ultima_varredura = agora
        limite_da_janela = agora - self._janela
        for chave in [
            chave
            for chave, instantes in self._tentativas.items()
            if not instantes or instantes[-1] <= limite_da_janela
        ]:
            del self._tentativas[chave]
