import 'reflect-metadata'
import { type IScopeService, type Lifecycle, SingletonScopeService, TransientScopeService } from './utils/shared'

// 依赖容器
const container = (function (self: any): Map<Function | String, IScopeService> {
    const selfcontainer = (self.__di_container__ = new Map<Function | String, IScopeService>())
    return selfcontainer
})(globalThis)

/**
 * 依赖配置项
 */
type DependencyOptions = {
    /**
     * 注入依赖的唯一ID
     */
    uniqueId?: string
    /**
     * 生命周期
     * @default 'singleton''
     */
    lifecycle?: Lifecycle
    /**
     * 依赖别名类型，仅支持类【class】和抽象类【abstract class】
     */
    alias?: Array<Function>
    /**
     * 为 true 时，ScopeService 立即生成 instance 实例，仅 lifecycle = 'singleton' 时有效。
     * @default false
     */
    immediate?: boolean
}

/**
 * 获取依赖容器
 * @returns
 */
export function GetDependencyContainer(): Map<Function | String, IScopeService> {
    return container
}
/**
 * 检查依赖是否存在
 * @param clsOrUniqueId
 * @returns
 */
export function ExistDependency(clsOrUniqueId: Function | String): boolean {
    return container.has(clsOrUniqueId)
}
/**
 * 添加依赖
 */
export function AddDependency<TObject extends Object>(dep: TObject, opts?: Pick<DependencyOptions, 'uniqueId' | 'alias'>) {
    const { uniqueId, alias = [] } = { ...opts }
    const target: Function = dep.constructor
    // 创建一个单例服务
    let service = new SingletonScopeService(target)
    // 直接设置实例，不再由 SingletonScopeService 自动创建
    service.ins = dep
    if (uniqueId) container.set(uniqueId, service)
    alias.push(target)
    alias.forEach((func) => container.set(func, service))

    return dep
}

/**
 * 解析依赖
 * @param cls 类型
 * @param opts
 * @returns InstanceType<Class> | undefined
 */
export function ResolveDependency<Class extends abstract new (...args: any) => any>(cls: Class): InstanceType<Class> | undefined {
    if (container.has(cls)) return container.get(cls)?.instance()
}

/**
 * 解析依赖，依赖不存在时创建依赖
 * @param cls 类型
 * @param opts
 * @returns InstanceType<Class> | undefined
 */
export function ResolveDependencyOrCreate<Class extends abstract new (...args: any) => any>(cls: Class, create: () => InstanceType<Class>, opts?: Pick<DependencyOptions, 'uniqueId' | 'alias'>): InstanceType<Class> {
    let dep: InstanceType<Class>
    if (container.has(cls)) {
        dep = container.get(cls)?.instance()
    } else {
        dep = AddDependency(create(), opts)
    }
    return dep
}

/**
 * 解析依赖（从唯一ID），依赖不存在时创建依赖
 * @param uniqueId 注入依赖的唯一ID
 * @returns InstanceType<Class> | undefined
 */
export function ResolveDependencyFromUniqueId<Class>(uniqueId: string): Class {
    return container.get(uniqueId)?.instance()
}

/**
 * 解析依赖（从唯一ID）
 * @param uniqueId 注入依赖的唯一ID
 * @returns InstanceType<Class> | undefined
 */
export function ResolveDependencyFromUniqueIdOrCreate<Class extends Object>(uniqueId: string, create: () => Class, opts?: Pick<DependencyOptions, 'uniqueId' | 'alias'>): Class | undefined {
    let dep: Class
    if (container.has(uniqueId)) {
        dep = container.get(uniqueId)?.instance()
    } else {
        dep = AddDependency(create(), opts)
    }
    return dep
}

/**
 * 装饰器：依赖
 * @param lifecycle 生命周期
 * @returns
 */
export function Dependency(opts?: DependencyOptions): ClassDecorator {
    const { uniqueId, alias = [], lifecycle = 'singleton', immediate = false } = { ...opts }
    return function (target: Function) {
        let service: IScopeService
        switch (lifecycle) {
            case 'singleton':
                service = new SingletonScopeService(target, immediate)
                break
            case 'transient':
            default:
                service = new TransientScopeService(target)
                break
        }
        if (uniqueId) container.set(uniqueId, service)
        alias.push(target)
        alias.forEach((func) => container.set(func, service))
    }
}

/**
 * 装饰器：注入
 * @param opts
 * @returns
 */
export function Injection(opts?: {
    /**
     * 注入依赖的唯一ID
     */
    uniqueId: string
}): PropertyDecorator {
    const { uniqueId } = { ...opts }
    return function (target: Object, propertyKey: string | symbol) {
        const property = typeof propertyKey === 'string' ? propertyKey : (propertyKey as any).name
        const cls: Function = Reflect.getMetadata('design:type', target, property)
        Reflect.defineProperty(target, propertyKey, {
            get() {
                if (container.has(cls)) return container.get(cls)?.instance()
                else if (uniqueId) return container.get(uniqueId)?.instance()
            },
        })
    }
}

export { IScopeService, Lifecycle, SingletonScopeService, TransientScopeService }
