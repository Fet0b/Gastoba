from dataclasses import asdict
from datetime import date
from uuid import uuid4

from gastoba.application.consultar_progresso_das_metas import ConsultarProgressoDasMetas
from gastoba.domain.caixinha_marcada import CaixinhaMarcada, GuardadoNasMetas
from gastoba.domain.categoria import CategoriaDoGasto
from gastoba.domain.conta import Conta
from gastoba.domain.destinacao import ParteDeDestinacao
from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.gasto import Gasto
from gastoba.domain.mes import Mes
from gastoba.domain.meta import AlvoDaMeta, Meta
from gastoba.domain.movimento_de_investimento import MovimentoDeInvestimento, TipoDeMovimento
from gastoba.domain.tag import Tag

NOVEMBRO = Mes(2026, 11)


def _preparar(unidade, ativo=True, marcar=True):
    pessoa = uuid4()
    unidade.confirmado.destinacoes_cadastradas.add((pessoa, Tag.de_texto("computador")))
    conta = Conta(pessoa, "Banco fictício", Dinheiro(0))
    marcacoes = (CaixinhaMarcada(CategoriaDoGasto.CONFORTO, Tag.de_texto("computador")),)
    with unidade as u:
        u.contas.adicionar(conta)
        u.renda_base.definir(pessoa, Dinheiro(400000))
        u.metas.salvar(Meta(pessoa, AlvoDaMeta.CONFORTO, 25))
        u.metas.salvar(Meta(pessoa, AlvoDaMeta.LIBERDADE_FINANCEIRA, 25))
        u.gastos.adicionar(
            Gasto(
                conta.id,
                Dinheiro(40000),
                "Compra",
                date(2026, 11, 3),
                CategoriaDoGasto.CONFORTO,
            )
        )
        investimento = uuid4()
        for tipo, valor, dia, sinal in [
            (TipoDeMovimento.APORTE, 30000, 5, 1),
            (TipoDeMovimento.RESGATE, 5000, 8, -1),
            (TipoDeMovimento.APORTE, 90000, 31, 1),  # outubro
        ]:
            movimento = MovimentoDeInvestimento(
                conta.id,
                tipo,
                Dinheiro(valor),
                "Aporte",
                date(2026, 10 if dia == 31 else 11, dia),
                investimento_id=investimento,
            )
            u.movimentos_de_investimento.adicionar(movimento)
            u.destinacoes.adicionar(
                movimento.id,
                [ParteDeDestinacao(Tag.de_texto("computador"), Dinheiro(sinal * valor))],
            )
        if marcar:
            u.guardado_nas_metas.salvar(pessoa, GuardadoNasMetas(ativo, marcacoes))
            u.commit()
            return pessoa
        u.commit()
    return pessoa


def _por_alvo(resumo):
    return {p.alvo: p for p in resumo.progressos}


def test_ligado_calcula_o_guardado_do_mes_so_da_categoria_marcada(unidade_de_trabalho):
    pessoa = _preparar(unidade_de_trabalho)
    resumo = ConsultarProgressoDasMetas(unidade_de_trabalho).executar(pessoa, NOVEMBRO)
    conforto = _por_alvo(resumo)[AlvoDaMeta.CONFORTO]
    assert conforto.guardado == Dinheiro(25000)
    assert conforto.caixinhas_guardadas == (Tag.de_texto("computador"),)
    # limite 1.000,00: 250,00 guardados = 25%
    assert conforto.percentual_guardado == 25
    financeira = _por_alvo(resumo)[AlvoDaMeta.LIBERDADE_FINANCEIRA]
    assert financeira.guardado == Dinheiro(0) and financeira.caixinhas_guardadas == ()


def test_mes_anterior_traz_o_guardado_daquele_mes(unidade_de_trabalho):
    pessoa = _preparar(unidade_de_trabalho)
    resumo = ConsultarProgressoDasMetas(unidade_de_trabalho).executar(pessoa, Mes(2026, 10))
    assert _por_alvo(resumo)[AlvoDaMeta.CONFORTO].guardado == Dinheiro(90000)


def _contar_leituras_de_partes(unidade, monkeypatch, pessoa):
    from conftest import RepositorioDeDestinacoesEmMemoria

    chamadas = []
    original = RepositorioDeDestinacoesEmMemoria.do_movimento

    def espiar(self, ids):
        chamadas.append(ids)
        return original(self, ids)

    with monkeypatch.context() as m:
        m.setattr(RepositorioDeDestinacoesEmMemoria, "do_movimento", espiar)
        resumo = ConsultarProgressoDasMetas(unidade).executar(pessoa, NOVEMBRO)
    return len(chamadas), resumo


def test_desligado_guardado_zero_e_nenhuma_leitura_a_mais(unidade_de_trabalho, monkeypatch):
    pessoa = _preparar(unidade_de_trabalho, ativo=False)
    desligado, resumo = _contar_leituras_de_partes(unidade_de_trabalho, monkeypatch, pessoa)
    for p in resumo.progressos:
        assert p.guardado == Dinheiro(0) and p.caixinhas_guardadas == ()
    with unidade_de_trabalho as u:
        u.guardado_nas_metas.salvar(
            pessoa,
            GuardadoNasMetas(
                True, (CaixinhaMarcada(CategoriaDoGasto.CONFORTO, Tag.de_texto("computador")),)
            ),
        )
        u.commit()
    ligado, _ = _contar_leituras_de_partes(unidade_de_trabalho, monkeypatch, pessoa)
    assert ligado == desligado + 1


def test_sem_configuracao_tambem_e_zero(unidade_de_trabalho):
    pessoa = _preparar(unidade_de_trabalho, marcar=False)
    resumo = ConsultarProgressoDasMetas(unidade_de_trabalho).executar(pessoa, NOVEMBRO)
    assert all(p.guardado == Dinheiro(0) for p in resumo.progressos)


def test_numeros_existentes_identicos_ligado_e_desligado(unidade_de_trabalho):
    pessoa = _preparar(unidade_de_trabalho)
    ligado = ConsultarProgressoDasMetas(unidade_de_trabalho).executar(pessoa, NOVEMBRO)
    with unidade_de_trabalho as u:
        u.guardado_nas_metas.salvar(
            pessoa,
            GuardadoNasMetas(
                False, (CaixinhaMarcada(CategoriaDoGasto.CONFORTO, Tag.de_texto("computador")),)
            ),
        )
        u.commit()
    desligado = ConsultarProgressoDasMetas(unidade_de_trabalho).executar(pessoa, NOVEMBRO)
    for a, b in zip(ligado.progressos, desligado.progressos, strict=True):
        for campo in (
            "alvo",
            "percentual",
            "renda",
            "gasto",
            "adicional",
            "caixinhas",
            "rentabilidade",
        ):
            assert getattr(a, campo) == getattr(b, campo)
        assert (a.limite, a.restante, a.percentual_usado, a.situacao, a.gasto_bruto) == (
            b.limite,
            b.restante,
            b.percentual_usado,
            b.situacao,
            b.gasto_bruto,
        )
    assert {k: v for k, v in asdict(ligado).items() if k != "progressos"} == {
        k: v for k, v in asdict(desligado).items() if k != "progressos"
    }
