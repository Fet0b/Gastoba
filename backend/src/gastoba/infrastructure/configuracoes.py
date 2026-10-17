from functools import lru_cache

from pydantic import NonNegativeInt, PositiveInt, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Configuracoes(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="GASTOBA_", env_file=".env", extra="ignore")

    url_banco: str = "sqlite:///./gastobs.db"
    origens_permitidas: list[str] = ["http://localhost:5173"]
    hosts_permitidos: list[str] = ["localhost", "127.0.0.1"]
    nome_usuario_padrao: str = "Usuário"
    # Fechado por padrão: o primeiro usuário vem do comando administrativo.
    cadastro_aberto: bool = False
    duracao_da_sessao_horas: PositiveInt = 12
    # Cookie de sessão com Secure; o servidor caseiro servido por HTTP na VPN usa False.
    cookie_seguro: bool = True
    # Falhas de login aceitas por e-mail e por IP em 15 minutos, antes do 429.
    tentativas_de_login: PositiveInt = 5
    # De quanto em quanto tempo a API gera os gastos e ganhos das recorrências; 0 desliga.
    intervalo_de_recorrencias_minutos: NonNegativeInt = 60
    # Importação bancária pela Pluggy (conector MeuPluggy): desligada sem as quatro primeiras.
    # Só a pessoa de `pluggy_email_do_dono` usa o recurso (o plano gratuito é de uso pessoal).
    pluggy_client_id: str | None = None
    pluggy_client_secret: SecretStr | None = None
    pluggy_item_ids: list[str] = []
    pluggy_email_do_dono: str | None = None
    # De quanto em quanto tempo a API busca transações novas; 0 desliga a busca periódica.
    pluggy_intervalo_horas: NonNegativeInt = 6
    # Na primeira busca de uma conta, quantos dias para trás.
    pluggy_dias_iniciais: PositiveInt = 30

    @property
    def importacao_ativa(self) -> bool:
        return bool(
            self.pluggy_client_id
            and self.pluggy_client_secret
            and self.pluggy_email_do_dono
            and self.pluggy_item_ids
        )


@lru_cache
def obter_configuracoes() -> Configuracoes:
    return Configuracoes()
