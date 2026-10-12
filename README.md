# painel-lateral

Plugin para o [Claude Code](https://claude.com/claude-code) que abre um painel lateral com:

1. **Custo da sessão** (US$)
2. **Tokens usados** (entrada, saída e cache, de todos os agentes)
3. **Agentes e subagentes**, clicáveis: ao clicar, mostra o que o agente está fazendo e os arquivos que ele criou e deletou
4. **Arquivos criados e deletados** na sessão, já na tela principal

As cores seguem o tema da sessão. O painel abre sozinho ao iniciar; o comando `/painel` abre de novo.

## Instalação

```
/plugin marketplace add domingossouzalima-dev/painel-lateral
/plugin install painel-lateral@painel-lateral
```

## Limitações

- O lado em que o painel encaixa é definido pelo terminal, não pelo plugin.
- "Criados" são os `Write` em caminho que não existia; "deletados" vêm do texto dos comandos `rm`, `unlink`, `trash` e `git rm` executados via Bash.

## Licença

[MIT](LICENSE)
