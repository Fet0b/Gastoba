from dataclasses import dataclass
from datetime import datetime, timedelta

from gastoba.domain.email import Email
from gastoba.domain.excecoes import CredenciaisInvalidas, EmailInvalido, SenhaInvalida
from gastoba.domain.portas import (
    GeradorDeSegredo,
    HasherDeSenha,
    LimitadorDeTentativas,
    Relogio,
    UnidadeDeTrabalho,
)
from gastoba.domain.segredo_de_acesso import SegredoDeAcesso
from gastoba.domain.senha import SenhaEmClaro
from gastoba.domain.sessao import Sessao


@dataclass(frozen=True, slots=True)
class SessaoIniciada:
    """Resultado do login: o token em claro existe só aqui, para ser entregue à pessoa."""

    token: SegredoDeAcesso
    expira_em: datetime


class EntrarComSenha:
    def __init__(
        self,
        unidade_de_trabalho: UnidadeDeTrabalho,
        hasher_de_senha: HasherDeSenha,
        gerador_de_segredo: GeradorDeSegredo,
        relogio: Relogio,
        duracao_da_sessao: timedelta,
        limitador_de_tentativas: LimitadorDeTentativas,
    ) -> None:
        self._unidade_de_trabalho = unidade_de_trabalho
        self._hasher_de_senha = hasher_de_senha
        self._gerador_de_segredo = gerador_de_segredo
        self._relogio = relogio
        self._duracao_da_sessao = duracao_da_sessao
        self._limitador_de_tentativas = limitador_de_tentativas

    def executar(self, email: str, senha: str, origem: str | None = None) -> SessaoIniciada:
        """Abre uma sessão; ``CredenciaisInvalidas``, sempre igual, para qualquer falha.

        Cada tentativa conta para o e-mail e para a ``origem`` (ex.: o IP de quem chama);
        acima do limite, ``MuitasTentativas`` antes de qualquer hash.
        """
        try:
            email_do_usuario: Email | None = Email.de_texto(email)
        except EmailInvalido:
            email_do_usuario = None
        chave_do_email = None if email_do_usuario is None else f"email:{email_do_usuario.valor}"
        chave_da_origem = None if origem is None else f"origem:{origem}"
        self._limitador_de_tentativas.registrar_tentativa(
            [chave for chave in (chave_do_email, chave_da_origem) if chave is not None]
        )

        sessao_iniciada = self._entrar(email_do_usuario, senha)

        # Sucesso: o e-mail volta a ter todas as tentativas; a origem só não perde esta.
        if chave_do_email is not None:
            self._limitador_de_tentativas.zerar(chave_do_email)
        if chave_da_origem is not None:
            self._limitador_de_tentativas.descontar(chave_da_origem)
        return sessao_iniciada

    def _entrar(self, email_do_usuario: Email | None, senha: str) -> SessaoIniciada:
        if email_do_usuario is None:
            # O formato não revela se o e-mail existe; recusa sem gastar o hash.
            raise CredenciaisInvalidas()
        try:
            senha_em_claro = SenhaEmClaro(senha)
        except SenhaInvalida:
            raise CredenciaisInvalidas() from None
        with self._unidade_de_trabalho as uow:
            usuario = uow.usuarios.obter_por_email(email_do_usuario)
            if usuario is None or usuario.senha_hash is None:
                # Mesmo custo de uma verificação real, para o tempo não revelar o e-mail.
                self._hasher_de_senha.verificar_falso(senha_em_claro)
                raise CredenciaisInvalidas()
            if not self._hasher_de_senha.verificar(senha_em_claro, usuario.senha_hash):
                raise CredenciaisInvalidas()
            token = SegredoDeAcesso.de_sessao(self._gerador_de_segredo.gerar())
            agora = self._relogio.agora()
            sessao = Sessao(
                usuario_id=usuario.id,
                hash_do_segredo=token.hash_sha256,
                criada_em=agora,
                expira_em=agora + self._duracao_da_sessao,
            )
            uow.sessoes.adicionar(sessao)
            uow.commit()
            return SessaoIniciada(token=token, expira_em=sessao.expira_em)
