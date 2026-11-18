// One place that talks to Privy. Components use useAuthWallet() and never import Privy directly,
// so the app still renders (with a clear message) when Privy isn't configured.
import { createContext, useContext, useMemo } from 'react';
import { PrivyProvider, usePrivy, useWallets, useSendTransaction, useFundWallet } from '@privy-io/react-auth';
import { base, baseSepolia } from 'viem/chains';
import { encodeFunctionData, erc20Abi } from 'viem';

const Ctx = createContext({ available: false, ready: true, authenticated: false });
export const useAuthWallet = () => useContext(Ctx);

function Bridge({ children }) {
  const { ready, authenticated, login, logout, getAccessToken } = usePrivy();
  const { wallets } = useWallets();
  const { sendTransaction } = useSendTransaction();
  const { fundWallet } = useFundWallet();
  const embedded = wallets.find((w) => w.walletClientType === 'privy');
  const value = useMemo(() => ({
    available: true, ready, authenticated, login, logout, getAccessToken, fundWallet,
    embeddedAddress: embedded?.address || null,
    /** Sign + broadcast a USDC transfer from the signed-in user's embedded wallet. Returns the tx hash. */
    async sendUsdc({ token, to, amountMicro, chainId, from, description, sponsor }) {
      const data = encodeFunctionData({ abi: erc20Abi, functionName: 'transfer', args: [to, BigInt(amountMicro)] });
      const { hash } = await sendTransaction(
        { to: token, data, chainId },
        { address: from, sponsor: !!sponsor, uiOptions: { description, buttonText: 'Send payment' } },
      );
      return hash;
    },
  }), [ready, authenticated, login, logout, getAccessToken, fundWallet, sendTransaction, embedded?.address]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function AuthWalletProvider({ meta, children }) {
  if (!meta?.privyAppId) return children;
  const chain = meta.chain.key === 'base-sepolia' ? baseSepolia : base;
  return (
    <PrivyProvider
      appId={meta.privyAppId}
      config={{
        loginMethods: ['email', 'google'],
        appearance: { theme: 'dark', accentColor: '#a9c4ff', landingHeader: 'Sign in to HaveAsk', loginMessage: 'Private church care. A wallet is created for you automatically.' },
        embeddedWallets: { ethereum: { createOnLogin: 'all-users' } },
        defaultChain: chain,
        supportedChains: [chain],
      }}
    >
      <Bridge>{children}</Bridge>
    </PrivyProvider>
  );
}
