import base64
import logging

import pytest

from gastoba.domain.senha import SenhaComHash, SenhaEmClaro
from gastoba.infrastructure.seguranca.hasher_de_senha_scrypt import HasherDeSenhaScrypt

SENHA = SenhaEmClaro("senha muito secreta")
OUTRA_SENHA = SenhaEmClaro("outra senha secreta")


@pytest.fixture
def hasher():
    # Parâmetros baratos: o custo padrão deixaria a suíte lenta.
    return HasherDeSenhaScrypt(n=2**4, r=1, p=1)


def test_parametros_padrao_sao_fortes():
    hasher = HasherDeSenhaScrypt()

    senha_hash = hasher.hashear(SENHA)

    algoritmo, n, r, p, _sal, _hash = senha_hash.valor.split("$")
    assert (algoritmo, int(n), int(r), int(p)) == ("scrypt", 2**15, 8, 1)
    assert hasher.verificar(SENHA, senha_hash)


def test_hash_e_diferente_a_cada_chamada(hasher):
    assert hasher.hashear(SENHA).valor != hasher.hashear(SENHA).valor


def test_hash_nao_contem_a_senha(hasher):
    assert SENHA.valor not in hasher.hashear(SENHA).valor


def test_formato_autodescritivo_com_parametros_e_sal(hasher):
    algoritmo, n, r, p, sal, hash_ = hasher.hashear(SENHA).valor.split("$")

    assert (algoritmo, n, r, p) == ("scrypt", "16", "1", "1")
    assert len(base64.b64decode(sal)) == 16
    assert len(base64.b64decode(hash_)) == 32


def test_verifica_senha_certa(hasher):
    assert hasher.verificar(SENHA, hasher.hashear(SENHA)) is True


def test_recusa_senha_errada(hasher):
    assert hasher.verificar(OUTRA_SENHA, hasher.hashear(SENHA)) is False


def test_verificar_le_os_parametros_do_hash_gravado(hasher):
    # Hash gravado com outros parâmetros (ex.: antes de reforçar o custo) continua valendo.
    senha_hash = HasherDeSenhaScrypt(n=2**5, r=2, p=2).hashear(SENHA)

    assert hasher.verificar(SENHA, senha_hash) is True
    assert hasher.verificar(OUTRA_SENHA, senha_hash) is False


def test_senha_com_acentos_e_emoji(hasher):
    senha = SenhaEmClaro("ação çãõ 🔑 senha")

    assert hasher.verificar(senha, hasher.hashear(senha)) is True


@pytest.mark.parametrize(
    "corrompido",
    [
        "x",
        "bcrypt$16$1$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
        "scrypt$16$1$1$sal",
        "scrypt$dezesseis$1$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
        "scrypt$15$1$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
        "scrypt$16$1$1$não-é-base64$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
        "scrypt$16$1$1$AAAAAAAAAAAAAAAAAAAAAA==$",
        "scrypt$16$1$1$$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
        "scrypt$-16$1$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
        "scrypt$16$0$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
    ],
)
def test_hash_corrompido_ou_desconhecido_devolve_false(hasher, corrompido):
    assert hasher.verificar(SENHA, SenhaComHash(corrompido)) is False


def test_hash_com_custo_abusivo_e_recusado_sem_calcular(hasher):
    # Um hash adulterado no banco não pode virar negação de serviço (memória/CPU).
    sal, hash_ = "A" * 22 + "==", "A" * 43 + "="
    abusivo = f"scrypt${2**30}$64$64${sal}${hash_}"

    assert hasher.verificar(SENHA, SenhaComHash(abusivo)) is False


@pytest.mark.parametrize(("n", "r", "p"), [(2**20, 32, 16), (2**20, 8, 1), (2**17, 8, 16)])
def test_hash_com_parametros_validos_isolados_mas_custo_total_abusivo_e_recusado(n, r, p):
    # Cada parâmetro dentro do teto não basta: n=2**20 com r=32 pediria ~4 GiB de memória.
    # Testa a leitura direto, sem chamar o scrypt, para não alocar memória se falhar.
    sal, hash_ = "A" * 22 + "==", "A" * 43 + "="

    lido = HasherDeSenhaScrypt._ler(SenhaComHash(f"scrypt${n}${r}${p}${sal}${hash_}"))

    assert lido is None


def test_custo_padrao_reforcado_ate_o_teto_continua_aceito():
    sal, hash_ = "A" * 22 + "==", "A" * 43 + "="

    lido = HasherDeSenhaScrypt._ler(SenhaComHash(f"scrypt${2**18}$8$1${sal}${hash_}"))

    assert lido is not None


def test_verificar_falso_nao_levanta_e_devolve_none(hasher):
    assert hasher.verificar_falso(SENHA) is None


def test_hash_falso_e_fixo_e_usa_os_mesmos_parametros(hasher):
    # Mesmo trabalho de verificar: os parâmetros do hash falso são os do hasher.
    falso = hasher._hash_falso

    hasher.verificar_falso(SENHA)

    assert hasher._hash_falso is falso
    assert falso.valor.split("$")[:4] == ["scrypt", "16", "1", "1"]


@pytest.mark.parametrize(
    "parametros",
    [
        {"n": 15},
        {"n": 1},
        {"r": 0},
        {"p": 0},
        {"n": 2**30},
        {"n": 2**20, "r": 32},
        {"tamanho_do_sal": 8},
    ],
)
def test_parametros_invalidos_no_construtor(parametros):
    with pytest.raises(ValueError):
        HasherDeSenhaScrypt(**parametros)


def test_nao_loga_a_senha(hasher, caplog):
    with caplog.at_level(logging.DEBUG):
        senha_hash = hasher.hashear(SENHA)
        hasher.verificar(SENHA, senha_hash)
        hasher.verificar(SENHA, SenhaComHash("corrompido"))
        hasher.verificar_falso(SENHA)

    assert SENHA.valor not in caplog.text
