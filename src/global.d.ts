import * as MahameruIPC from '../../mahameru/dist/types'
import type * as Mahameru from '../../mahameru/dist/types/mahameru.d.ts';
import type * as MahameruCFG from '../../mahameru/dist/config'

declare global {
    type MahameruConfig = MahameruCFG.MahameruConfig
    type MahameruIPCMessageServer = MahameruIPC.MahameruIPCMessageServer;
    type MahameruIPCMessageChild = MahameruIPC.MahameruIPCMessageChild;
    type MahameruMode = Mahameru.MahameruMode
    type MahameruIPCServerDataMap = MahameruIPC.MahameruIPCServerDataMap
}

export { }
