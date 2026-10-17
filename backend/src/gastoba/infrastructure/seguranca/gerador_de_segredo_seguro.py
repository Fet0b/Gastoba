import secrets
import string

from gastoba.domain.segredo_de_acesso import TAMANHO_DO_PREFIXO_PUBLICO

_BYTES_DE_ENTROPIA = 32  # 256 bits → 43 caracteres em base64 url-safe
_ALFABETO_DO_PREFIXO = string.ascii_letters + string.digits


class GeradorDeSegredoSeguro:
    """Satisfaz a porta GeradorDeSegredo com o gerador criptográfico do sistema.

    Entrega só as partes aleatórias; o ``SegredoDeAcesso`` do domain monta os formatos
    ``gsess_<aleatório>`` e ``gapi_<prefixo>_<aleatório>``.
    """

    def gerar(self) -> str:
        return secrets.token_urlsafe(_BYTES_DE_ENTROPIA)

    def gerar_prefixo(self) -> str:
        return "".join(
            secrets.choice(_ALFABETO_DO_PREFIXO) for _ in range(TAMANHO_DO_PREFIXO_PUBLICO)
        )
