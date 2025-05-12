/**
 * 依赖生命周期
 */
export type Lifecycle = 'transient' | 'singleton'

/**
 * 作用域服务
 */
export interface IScopeService {
    /**
     * class prototype
     */
    readonly cls: Function
    /**
     * 返回对象实例
     */
    instance(): any
}

/**
 * 瞬态实例服务
 */
export class TransientScopeService implements IScopeService {
    cls: Function
    constructor(cls: Function) {
        this.cls = cls
    }
    instance() {
        return Reflect.construct(this.cls, [])
    }
}

/**
 * 单例服务
 */
export class SingletonScopeService implements IScopeService {
    cls: Function
    ins: any
    constructor(cls: Function, immediate = false) {
        this.cls = cls
        // 立即生成实例
        if (immediate) this.instance()
    }
    instance() {
        if (!this.ins) this.ins = Reflect.construct(this.cls, [])
        return this.ins
    }
}
