"""Hash de senha com scrypt (biblioteca padrão), sal aleatório e parâmetros no próprio hash.

Formato gravado: ``scrypt$<n>$<r>$<p>$<sal em base64>$<hash em base64>``. Como os
parâmetros vão junto, o custo pode ser reforçado depois sem invalidar as senhas antigas.
Nada aqui registra logs: a senha nunca pode aparecer neles (Art. IV.3).
"""

import base64
import binascii
import hashlib
import hmac
import os
import re
from dataclasses import dataclass

from gastoba.domain.senha import SenhaComHash, SenhaEmClaro

_ALGORITMO = "scrypt"
_TAMANHO_DO_HASH = 32
_TAMANHO_MINIMO_DO_SAL = 16

# Limites aceitos tanto no construtor quanto ao ler um hash gravado: um hash adulterado
# no banco com custo enorme não pode virar negação de serviço (memória e CPU).
_N_MAXIMO = 2**20
_R_MAXIMO = 32
_P_MAXIMO = 16
# Cada teto isolado ainda permitiria ~4 GiB (n=2**20, r=32); o custo total n·r·p limita
# memória (~128·n·r bytes, até 256 MiB) e CPU a 8 vezes o padrão (2**15·8·1 = 2**18).
_CUSTO_MAXIMO = 2**21
_TAMANHO_MAXIMO_DO_HASH = 128
_TAMANHO_MAXIMO_DO_SAL = 64

_INTEIRO = re.compile(r"[0-9]{1,8}")


@dataclass(frozen=True, slots=True)
class _Parametros:
    n: int
    r: int
    p: int

    def sao_validos(self) -> bool:
        n_e_potencia_de_dois = self.n >= 2 and self.n & (self.n - 1) == 0
        return (
            n_e_potencia_de_dois
            and self.n <= _N_MAXIMO
            and 1 <= self.r <= _R_MAXIMO
            and 1 <= self.p <= _P_MAXIMO
            and self.n * self.r * self.p <= _CUSTO_MAXIMO
        )

    @property
    def memoria_maxima(self) -> int:
        # O scrypt usa ~128·r·(n + p) bytes; a folga evita o limite padrão de 32 MiB do
        # OpenSSL, que recusaria exatamente os parâmetros padrão (n=2**15, r=8).
        return 2 * 128 * self.r * (self.n + self.p + 2)


def _codificar(dados: bytes) -> str:
    return base64.b64encode(dados).decode("ascii")


def _decodificar(texto: str) -> bytes:
    return base64.b64decode(texto.encode("ascii"), validate=True)


def _bytes_da_senha(senha: SenhaEmClaro) -> bytes:
    # surrogatepass: um texto JSON com surrogate isolado não derruba o hash com 500.
    return senha.valor.encode("utf-8", "surrogatepass")


class HasherDeSenhaScrypt:
    """Satisfaz a porta HasherDeSenha por tipagem estrutural.

    Os padrões (n=2**15, r=8, p=1: 32 MiB, ~0,1 s) são os do artigo do scrypt para login
    interativo; o OWASP hoje sugere n=2**17 (128 MiB), que cabe no ``_CUSTO_MAXIMO`` se o
    custo for reforçado. Os testes injetam parâmetros baratos pelo construtor.
    """

    def __init__(self, n: int = 2**15, r: int = 8, p: int = 1, tamanho_do_sal: int = 16) -> None:
        self._parametros = _Parametros(n, r, p)
        if not self._parametros.sao_validos():
            raise ValueError("Parâmetros do scrypt inválidos.")
        if not _TAMANHO_MINIMO_DO_SAL <= tamanho_do_sal <= _TAMANHO_MAXIMO_DO_SAL:
            raise ValueError("Tamanho do sal do scrypt inválido.")
        self._tamanho_do_sal = tamanho_do_sal
        # Hash falso fixo, gerado uma vez e com os mesmos parâmetros: verificar_falso faz
        # exatamente o trabalho de verificar. Os bytes não precisam vir de uma senha real.
        self._hash_falso = self._montar(os.urandom(tamanho_do_sal), os.urandom(_TAMANHO_DO_HASH))

    def hashear(self, senha: SenhaEmClaro) -> SenhaComHash:
        sal = os.urandom(self._tamanho_do_sal)
        return self._montar(sal, self._calcular(senha, sal, self._parametros, _TAMANHO_DO_HASH))

    def verificar(self, senha: SenhaEmClaro, senha_hash: SenhaComHash) -> bool:
        lido = self._ler(senha_hash)
        if lido is None:
            return False
        parametros, sal, esperado = lido
        try:
            calculado = self._calcular(senha, sal, parametros, len(esperado))
        except ValueError, MemoryError:
            return False
        return hmac.compare_digest(calculado, esperado)

    def verificar_falso(self, senha: SenhaEmClaro) -> None:
        self.verificar(senha, self._hash_falso)

    def _montar(self, sal: bytes, hash_: bytes) -> SenhaComHash:
        p = self._parametros
        return SenhaComHash(f"{_ALGORITMO}${p.n}${p.r}${p.p}${_codificar(sal)}${_codificar(hash_)}")

    @staticmethod
    def _ler(senha_hash: SenhaComHash) -> tuple[_Parametros, bytes, bytes] | None:
        partes = senha_hash.valor.split("$")
        if len(partes) != 6 or partes[0] != _ALGORITMO:
            return None
        if not all(_INTEIRO.fullmatch(parte) for parte in partes[1:4]):
            return None
        parametros = _Parametros(int(partes[1]), int(partes[2]), int(partes[3]))
        if not parametros.sao_validos():
            return None
        try:
            sal, hash_ = _decodificar(partes[4]), _decodificar(partes[5])
        except binascii.Error, UnicodeEncodeError:
            return None
        if not _TAMANHO_MINIMO_DO_SAL <= len(sal) <= _TAMANHO_MAXIMO_DO_SAL:
            return None
        if not 1 <= len(hash_) <= _TAMANHO_MAXIMO_DO_HASH:
            return None
        return parametros, sal, hash_

    @staticmethod
    def _calcular(senha: SenhaEmClaro, sal: bytes, parametros: _Parametros, tamanho: int) -> bytes:
        return hashlib.scrypt(
            _bytes_da_senha(senha),
            salt=sal,
            n=parametros.n,
            r=parametros.r,
            p=parametros.p,
            maxmem=parametros.memoria_maxima,
            dklen=tamanho,
        )
